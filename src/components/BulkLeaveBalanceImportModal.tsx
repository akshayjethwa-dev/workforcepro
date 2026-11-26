import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Info,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {
  LeaveBalanceImportBatch,
  LeaveBalanceRecord,
  OrgSettings,
  Worker,
} from '../types/index';
import { dbService } from '../services/db';
import { useToast } from '../contexts/ToastContext';
import {
  downloadLeaveBalanceTemplate,
  LEAVE_BALANCE_TEMPLATE_FILENAME,
} from '../utils/workerExcelTemplate';
import {
  commitLeaveBalanceImport,
  createDemoLeaveBalanceExcelFile,
  downloadLeaveBalanceErrorReport,
  LeaveBalanceValidationResult,
  MAX_LEAVE_IMPORT_ROWS_PER_BATCH,
  parseAndValidateLeaveBalanceFile,
} from '../utils/workerImportEngine';

interface BulkLeaveBalanceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  orgSettings?: OrgSettings | null;
  existingWorkers?: Worker[];
  actorEmail?: string;
  onSuccess: () => void;
  onOrgSettingsUpdated?: (updated: OrgSettings) => void;
  onSwitchToWorkerImport?: () => void;
}

type ModalStage = 'UPLOAD' | 'PREVIEW' | 'COMPLETE';
type RowFilter = 'ALL' | 'MATCHED' | 'UNMATCHED' | 'ERRORS' | 'NEGATIVE';

export const BulkLeaveBalanceImportModal: React.FC<BulkLeaveBalanceImportModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  orgSettings,
  existingWorkers = [],
  actorEmail = 'admin@factory.in',
  onSuccess,
  onOrgSettingsUpdated,
  onSwitchToWorkerImport,
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stage, setStage] = useState<ModalStage>('UPLOAD');
  const [migrationDate, setMigrationDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [effectiveSettings, setEffectiveSettings] = useState<OrgSettings | null>(
    orgSettings || null
  );
  const [savingPolicy, setSavingPolicy] = useState<boolean>(false);

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [parsing, setParsing] = useState<boolean>(false);
  const [committing, setCommitting] = useState<boolean>(false);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<LeaveBalanceValidationResult | null>(
    null
  );
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [rowFilter, setRowFilter] = useState<RowFilter>('ALL');

  const [committedBatch, setCommittedBatch] = useState<LeaveBalanceImportBatch | null>(null);
  const [committedRecords, setCommittedRecords] = useState<LeaveBalanceRecord[]>([]);
  const [recentHistory, setRecentHistory] = useState<LeaveBalanceImportBatch[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  useEffect(() => {
    if (orgSettings) {
      setEffectiveSettings(orgSettings);
    }
  }, [orgSettings]);

  useEffect(() => {
    if (isOpen) {
      dbService
        .getLeaveBalanceImportHistory(tenantId)
        .then((hist) => setRecentHistory(hist.slice(0, 6)))
        .catch(() => {});
      if (!orgSettings) {
        dbService
          .getOrgSettings(tenantId)
          .then((s) => setEffectiveSettings(s))
          .catch(() => {});
      }
    } else {
      setStage('UPLOAD');
      setUploadedFile(null);
      setValidationResult(null);
      setTransactionError(null);
      setRowFilter('ALL');
      setCommittedBatch(null);
      setCommittedRecords([]);
      setParsing(false);
      setCommitting(false);
      setShowHistory(false);
    }
  }, [isOpen, tenantId, orgSettings]);

  if (!isOpen) return null;

  const allowNegativeBalance = Boolean(effectiveSettings?.leavePolicy?.allowNegativeBalance);

  const runValidationForFile = async (
    file: File,
    settingsOverride: OrgSettings | null = effectiveSettings,
    dateOverride: string = migrationDate
  ) => {
    setParsing(true);
    setTransactionError(null);
    setUploadedFile(file);
    try {
      const liveExisting =
        existingWorkers.length > 0 ? existingWorkers : await dbService.getWorkers(tenantId);
      const result = await parseAndValidateLeaveBalanceFile({
        file,
        tenantId,
        existingWorkers: liveExisting,
        orgSettings: settingsOverride,
        migrationDate: dateOverride,
      });

      setValidationResult(result);
      if (result.ok) {
        if (result.hasDuplicatePhones || result.blockingErrorRows.length > 0) {
          setRowFilter('ERRORS');
        } else {
          setRowFilter('ALL');
        }
        setStage('PREVIEW');
      } else {
        setStage('UPLOAD');
      }
    } catch (err) {
      console.error('Leave balance file validation failed:', err);
      toast.error('Failed to parse the uploaded leave balance file.');
    } finally {
      setParsing(false);
    }
  };

  const handleToggleNegativePolicy = async (nextAllowed: boolean) => {
    setSavingPolicy(true);
    try {
      const baseSettings = effectiveSettings || (await dbService.getOrgSettings(tenantId));
      const updatedSettings: OrgSettings = {
        ...baseSettings,
        leavePolicy: {
          cl: baseSettings.leavePolicy?.cl ?? 7,
          sl: baseSettings.leavePolicy?.sl ?? 7,
          pl: baseSettings.leavePolicy?.pl ?? 15,
          allowNegativeBalance: nextAllowed,
        },
      };
      await dbService.saveOrgSettings(tenantId, updatedSettings);
      setEffectiveSettings(updatedSettings);
      onOrgSettingsUpdated?.(updatedSettings);
      toast.success(
        nextAllowed
          ? 'Tenant policy updated: Negative leave balances are now accepted for payroll deduction.'
          : 'Tenant policy updated: Negative leave balances will be flagged as errors.'
      );

      // Re-validate immediately if a file is already loaded in Preview
      if (uploadedFile && stage === 'PREVIEW') {
        await runValidationForFile(uploadedFile, updatedSettings, migrationDate);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Unable to update Leave Policy setting.');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await runValidationForFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await runValidationForFile(file);
  };

  const handleDownloadTemplate = (prefillExistingWorkers = true) => {
    try {
      const fileName = downloadLeaveBalanceTemplate({
        existingWorkers,
        prefillExistingWorkers,
      });
      toast.success(
        prefillExistingWorkers && existingWorkers.length > 0
          ? `Downloaded ${fileName} pre-filled with your active workers' phone numbers.`
          : `Downloaded blank ${fileName} with sample rows and Read Me guide.`
      );
    } catch {
      toast.error('Unable to download Leave_Balance_Template.xlsx.');
    }
  };

  const handleTrySample = async (scenario: 'MIGRATION_SAMPLE' | 'DUPLICATE_PHONE_SAMPLE') => {
    const liveExisting =
      existingWorkers.length > 0 ? existingWorkers : await dbService.getWorkers(tenantId);
    const sampleFile = createDemoLeaveBalanceExcelFile(liveExisting, scenario);
    await runValidationForFile(sampleFile);
  };

  const handleDownloadReport = () => {
    if (!validationResult) return;
    try {
      const outName = downloadLeaveBalanceErrorReport(validationResult);
      toast.success(`Downloaded ${outName}`);
    } catch {
      toast.error('Failed to download validation report.');
    }
  };

  const handleConfirmImport = async () => {
    if (!validationResult || !validationResult.canCommit) return;
    setCommitting(true);
    setTransactionError(null);
    try {
      const { batch, updatedRecords } = await commitLeaveBalanceImport({
        tenantId,
        validationResult,
        actorEmail,
        migrationDate,
      });

      setCommittedBatch(batch);
      setCommittedRecords(updatedRecords);
      setStage('COMPLETE');
      setRecentHistory((prev) => [batch, ...prev].slice(0, 6));
      onSuccess();
      toast.success(
        `Opening leave balances updated for ${updatedRecords.length} worker${
          updatedRecords.length === 1 ? '' : 's'
        } (as of ${migrationDate}).`
      );
    } catch (err: any) {
      const msg =
        err?.message || 'Transaction rolled back — 0 worker leave balances were modified.';
      setTransactionError(msg);
      toast.error(msg);
    } finally {
      setCommitting(false);
    }
  };

  const visibleRows = validationResult
    ? rowFilter === 'MATCHED'
      ? validationResult.matchedRows
      : rowFilter === 'UNMATCHED'
      ? validationResult.unmatchedRows
      : rowFilter === 'ERRORS'
      ? validationResult.blockingErrorRows
      : rowFilter === 'NEGATIVE'
      ? validationResult.negativeBalanceRows
      : validationResult.allRows
    : [];

  return (
    <div className="fixed inset-0 bg-slate-950/75 z-50 flex items-center justify-center p-3 sm:p-5 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <CalendarDays size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold tracking-tight truncate">
                  {stage === 'UPLOAD'
                    ? 'Bulk Leave Balance Import'
                    : stage === 'PREVIEW'
                    ? 'Leave Balance Validation Preview'
                    : 'Leave Balances Committed'}
                </h3>
                {onSwitchToWorkerImport && stage === 'UPLOAD' && (
                  <button
                    type="button"
                    onClick={onSwitchToWorkerImport}
                    className="text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer"
                  >
                    Switch to New Workers Import
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-300 truncate">
                {stage === 'UPLOAD'
                  ? `Upload ${LEAVE_BALANCE_TEMPLATE_FILENAME} to migrate opening EL, SL & CL balances atomically`
                  : stage === 'PREVIEW'
                  ? `${validationResult?.fileName} • Opening Balance As-Of ${migrationDate} • Atomic Transaction`
                  : `Batch ${committedBatch?.id} • ${committedRecords.length} workers updated atomically`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* STAGE 1: CONFIGURE & UPLOAD */}
          {stage === 'UPLOAD' && (
            <>
              {/* Step 1: Mid-Year Migration Date + Negative Balance Policy */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {/* Mid-Year Migration Date Card */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="leave-migration-date"
                      className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5"
                    >
                      <CalendarDays size={14} className="text-indigo-600" />
                      <span>Migration Effective Date (Opening Balance)</span>
                    </label>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                      Mid-Year Safe
                    </span>
                  </div>
                  <input
                    id="leave-migration-date"
                    type="date"
                    value={migrationDate}
                    onChange={(e) => setMigrationDate(e.target.value)}
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:border-indigo-600"
                  />
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Uploaded values are saved as each worker&apos;s <strong>Absolute Opening Balance</strong> on this date. Future accruals apply strictly from <strong>{migrationDate}</strong> forward without double-deducting prior leaves.
                  </p>
                </div>

                {/* Tenant Negative Balance Policy Card */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <ShieldCheck size={14} className="text-emerald-600" />
                        <span>Negative Leave Balance Policy</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        {allowNegativeBalance ? (
                          <>
                            <strong className="text-emerald-800">Accepted (Payroll Deduction):</strong>{' '}
                            Over-taken leaves (e.g. <span className="font-mono font-bold">-2</span> days) will be imported and queued as a deduction in the{' '}
                            <span className="font-mono font-semibold">{migrationDate.slice(0, 7)}</span> payroll.
                          </>
                        ) : (
                          <>
                            <strong className="text-amber-800">Flagged as Error:</strong>{' '}
                            Any negative value (e.g. <span className="font-mono font-bold">-2</span>) will block import unless you enable &quot;Allow Negative Balances&quot;.
                          </>
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={savingPolicy}
                      onClick={() => handleToggleNegativePolicy(!allowNegativeBalance)}
                      className={`shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer disabled:opacity-50 ${
                        allowNegativeBalance
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-900 hover:bg-emerald-200'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {savingPolicy
                        ? 'Saving...'
                        : allowNegativeBalance
                        ? 'Allowed: ON'
                        : 'Allowed: OFF'}
                    </button>
                  </div>

                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1 border-t border-slate-200/70">
                    <Info size={12} className="text-slate-400 shrink-0" />
                    <span>Synced with Settings → Leave Policy → Allow Negative Balances.</span>
                  </div>
                </div>
              </div>

              {/* Fatal Parse / Header Error Banner */}
              {validationResult && !validationResult.ok && (
                <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 flex items-start gap-3 animate-in fade-in">
                  <XCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1 min-w-0">
                    <h4 className="text-sm font-black text-rose-950">
                      {validationResult.fatalError}
                    </h4>
                    {validationResult.fatalDetail && (
                      <p className="text-xs text-rose-800 leading-relaxed">
                        {validationResult.fatalDetail}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate(true)}
                      className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-rose-900 underline underline-offset-2 hover:text-rose-950 cursor-pointer"
                    >
                      <Download size={13} />
                      <span>Download {LEAVE_BALANCE_TEMPLATE_FILENAME}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Upload Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`p-7 sm:p-8 rounded-2xl border-2 border-dashed transition-all text-center flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? 'border-indigo-600 bg-indigo-50/70'
                    : 'border-slate-300 bg-slate-50/60 hover:border-indigo-400 hover:bg-indigo-50/20'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  {parsing ? (
                    <RefreshCw size={26} className="animate-spin" />
                  ) : (
                    <Upload size={26} />
                  )}
                </div>

                <div className="space-y-1 max-w-xl">
                  <h4 className="text-sm sm:text-base font-bold text-slate-900">
                    {parsing
                      ? 'Matching phone numbers & validating balances...'
                      : 'Upload filled Leave_Balance_Template.xlsx (or .csv)'}
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Required columns:{' '}
                    <span className="font-semibold text-slate-700">
                      Worker Phone Number, Worker Name, Earned Leave Balance, Sick Leave Balance, Casual Leave Balance
                    </span>
                    . Max <strong>{MAX_LEAVE_IMPORT_ROWS_PER_BATCH} rows</strong> per atomic transaction.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={parsing}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Upload size={15} />
                    <span>Upload Leave Balances (.xlsx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadTemplate(true)}
                    className="px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={15} />
                    <span>Download {LEAVE_BALANCE_TEMPLATE_FILENAME}</span>
                  </button>
                </div>

                {/* Quick Sample / Testing Actions */}
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-2 text-xs">
                  <button
                    type="button"
                    disabled={parsing}
                    onClick={() => handleTrySample('MIGRATION_SAMPLE')}
                    className="inline-flex items-center gap-1.5 font-semibold text-slate-600 hover:text-indigo-700 underline underline-offset-2 cursor-pointer"
                  >
                    <Sparkles size={13} />
                    <span>Try sample migration (matched + unmatched + -2d balance)</span>
                  </button>
                  <button
                    type="button"
                    disabled={parsing}
                    onClick={() => handleTrySample('DUPLICATE_PHONE_SAMPLE')}
                    className="inline-flex items-center gap-1.5 font-semibold text-slate-500 hover:text-rose-700 underline underline-offset-2 cursor-pointer"
                  >
                    <ShieldAlert size={13} />
                    <span>Test duplicate phone rejection</span>
                  </button>
                </div>
              </div>

              {/* Recent Import History */}
              {recentHistory.length > 0 && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => setShowHistory((v) => !v)}
                    className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <History size={14} className="text-indigo-600" />
                      <span>Recent Leave Balance Import History ({recentHistory.length})</span>
                    </span>
                    <span className="text-slate-500">{showHistory ? 'Hide' : 'Show'}</span>
                  </button>
                  {showHistory && (
                    <div className="divide-y divide-slate-100 text-xs">
                      {recentHistory.map((item) => (
                        <div
                          key={item.id}
                          className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">{item.fileName}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              Effective {item.migrationDate} · {new Date(item.importedAt).toLocaleString()} · by {item.importedBy}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-semibold text-slate-700">
                              {item.matchedWorkersUpdated} updated
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                                item.status === 'COMMITTED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* STAGE 2: VALIDATION PREVIEW */}
          {stage === 'PREVIEW' && validationResult && (
            <>
              {/* Exact Headline Summary Banner (AC #4) */}
              <div
                className={`p-4 sm:p-5 rounded-2xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  validationResult.canCommit
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-rose-50 border-rose-300'
                }`}
              >
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div
                    className={`w-12 h-12 rounded-xl text-white flex items-center justify-center shrink-0 ${
                      validationResult.canCommit ? 'bg-emerald-600' : 'bg-rose-600'
                    }`}
                  >
                    {validationResult.canCommit ? (
                      <CheckCircle2 size={24} />
                    ) : (
                      <ShieldAlert size={24} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4
                      className={`text-base sm:text-lg font-black tracking-tight ${
                        validationResult.canCommit ? 'text-emerald-950' : 'text-rose-950'
                      }`}
                    >
                      {validationResult.summaryMessage}
                    </h4>
                    <p
                      className={`text-xs mt-0.5 ${
                        validationResult.canCommit ? 'text-emerald-800' : 'text-rose-800'
                      }`}
                    >
                      {validationResult.canCommit
                        ? `Ready to commit absolute Opening Balances as of ${migrationDate} in a single atomic transaction.`
                        : validationResult.blockReason}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <div className="px-3 py-1.5 rounded-xl bg-white/90 border border-slate-200 text-center min-w-[4.5rem]">
                    <div className="text-base font-black font-mono text-emerald-700 leading-none">
                      {validationResult.matchedCount}
                    </div>
                    <div className="text-[10px] font-bold uppercase text-slate-500 mt-0.5">
                      Matched
                    </div>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-white/90 border border-slate-200 text-center min-w-[4.5rem]">
                    <div className="text-base font-black font-mono text-amber-700 leading-none">
                      {validationResult.unmatchedCount}
                    </div>
                    <div className="text-[10px] font-bold uppercase text-slate-500 mt-0.5">
                      Unmatched
                    </div>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-white/90 border border-slate-200 text-center min-w-[4.5rem]">
                    <div className="text-base font-black font-mono text-rose-700 leading-none">
                      {validationResult.blockingErrorRows.length}
                    </div>
                    <div className="text-[10px] font-bold uppercase text-slate-500 mt-0.5">
                      Errors
                    </div>
                  </div>
                </div>
              </div>

              {/* Duplicate Phone Numbers Blocking Banner */}
              {validationResult.hasDuplicatePhones && (
                <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 space-y-2">
                  <div className="flex items-center gap-2 text-rose-950 font-black text-sm">
                    <XCircle size={18} className="text-rose-600 shrink-0" />
                    <span>Import Failed: Duplicate Phone Numbers Detected</span>
                  </div>
                  <p className="text-xs text-rose-800">
                    Each worker phone number can appear only once in a leave balance import file. Remove the duplicate row(s) below and re-upload:
                  </p>
                  <ul className="list-disc pl-5 text-xs font-mono font-semibold text-rose-900 space-y-1">
                    {validationResult.duplicatePhoneIssues.map((dup) => (
                      <li key={dup.phone}>{dup.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Negative Balances Policy Alert (Blocked vs Accepted) */}
              {validationResult.negativeBalanceRows.length > 0 && !validationResult.allowNegativeBalance && (
                <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-950 space-y-0.5">
                      <div className="font-black">
                        {validationResult.negativeBalanceRows.length} worker
                        {validationResult.negativeBalanceRows.length === 1 ? '' : 's'} have negative leave balances (blocked by Tenant Settings)
                      </div>
                      <p className="text-amber-900">
                        Your Leave Policy currently blocks negative balances. Either fix the Excel values to ≥ 0 or enable &quot;Allow Negative Balances&quot; so over-taken leave is deducted in the next payroll.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={savingPolicy}
                    onClick={() => handleToggleNegativePolicy(true)}
                    className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {savingPolicy ? 'Updating...' : 'Allow Negative Balances & Re-check'}
                  </button>
                </div>
              )}

              {validationResult.negativeBalanceRows.length > 0 && validationResult.allowNegativeBalance && (
                <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-start gap-2.5 text-xs text-indigo-950">
                  <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>
                      {validationResult.negativeBalanceRows.length} worker
                      {validationResult.negativeBalanceRows.length === 1 ? '' : 's'} with negative balance accepted:
                    </strong>{' '}
                    Over-taken leave days will be stored as negative opening balances and automatically itemized as a payroll deduction in{' '}
                    <span className="font-mono font-bold">{migrationDate.slice(0, 7)}</span>.
                  </div>
                </div>
              )}

              {/* Transaction Rollback Error Alert */}
              {transactionError && (
                <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 flex items-start gap-3">
                  <XCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-900 space-y-1">
                    <div className="font-black text-sm text-rose-950">
                      Atomic Transaction Rolled Back
                    </div>
                    <p>{transactionError}</p>
                  </div>
                </div>
              )}

              {/* Filter Tabs + Migration Date Context */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex flex-wrap items-center p-1 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold gap-1">
                  <button
                    type="button"
                    onClick={() => setRowFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      rowFilter === 'ALL'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({validationResult.totalRows})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRowFilter('MATCHED')}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      rowFilter === 'MATCHED'
                        ? 'bg-white text-emerald-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Matched ({validationResult.matchedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRowFilter('UNMATCHED')}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      rowFilter === 'UNMATCHED'
                        ? 'bg-white text-amber-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Unmatched ({validationResult.unmatchedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRowFilter('ERRORS')}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      rowFilter === 'ERRORS'
                        ? 'bg-white text-rose-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Errors ({validationResult.blockingErrorRows.length})
                  </button>
                  {validationResult.negativeBalanceRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRowFilter('NEGATIVE')}
                      className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        rowFilter === 'NEGATIVE'
                          ? 'bg-white text-indigo-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Negative ({validationResult.negativeBalanceRows.length})
                    </button>
                  )}
                </div>

                <div className="text-xs text-slate-500 font-medium">
                  Opening Balance As-Of:{' '}
                  <strong className="font-mono text-slate-900">{migrationDate}</strong>
                </div>
              </div>

              {/* Row-by-Row Validation Preview Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                      <tr className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                        <th className="py-2.5 px-3">Row</th>
                        <th className="py-2.5 px-3">Phone Number</th>
                        <th className="py-2.5 px-3">Worker Name</th>
                        <th className="py-2.5 px-3 text-right">Earned (EL)</th>
                        <th className="py-2.5 px-3 text-right">Sick (SL)</th>
                        <th className="py-2.5 px-3 text-right">Casual (CL)</th>
                        <th className="py-2.5 px-3">Validation Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            No rows match this filter.
                          </td>
                        </tr>
                      ) : (
                        visibleRows.map((row) => {
                          const hasErrors = row.errors.length > 0;
                          const rowBg = hasErrors
                            ? 'bg-rose-50/60 hover:bg-rose-50'
                            : !row.isMatched
                            ? 'bg-amber-50/40 hover:bg-amber-50/70'
                            : 'hover:bg-slate-50/80';

                          return (
                            <tr key={row.rowNumber} className={rowBg}>
                              <td className="py-2.5 px-3 font-mono text-slate-400">
                                #{row.rowNumber}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                                {row.normalizedPhone || row.rawPhone || (
                                  <span className="text-rose-500 italic font-sans">Missing</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900">
                                  {row.matchedWorkerName || row.excelWorkerName || (
                                    <span className="text-slate-400 italic">Unnamed</span>
                                  )}
                                </div>
                                {row.nameMismatch && row.matchedWorkerName && (
                                  <div className="text-[11px] text-amber-700 font-medium">
                                    Excel: &quot;{row.excelWorkerName}&quot;
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold">
                                {row.earnedLeave !== null ? (
                                  <span
                                    className={
                                      row.earnedLeave < 0 ? 'text-rose-700' : 'text-slate-900'
                                    }
                                  >
                                    {row.earnedLeave}
                                  </span>
                                ) : (
                                  <span className="text-rose-500 font-sans italic">Invalid</span>
                                )}
                                {row.previousBalances && (
                                  <span className="block text-[10px] text-slate-400 font-normal">
                                    was {row.previousBalances.earnedLeave}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold">
                                {row.sickLeave !== null ? (
                                  <span
                                    className={
                                      row.sickLeave < 0 ? 'text-rose-700' : 'text-slate-900'
                                    }
                                  >
                                    {row.sickLeave}
                                  </span>
                                ) : (
                                  <span className="text-rose-500 font-sans italic">Invalid</span>
                                )}
                                {row.previousBalances && (
                                  <span className="block text-[10px] text-slate-400 font-normal">
                                    was {row.previousBalances.sickLeave}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold">
                                {row.casualLeave !== null ? (
                                  <span
                                    className={
                                      row.casualLeave < 0 ? 'text-rose-700' : 'text-slate-900'
                                    }
                                  >
                                    {row.casualLeave}
                                  </span>
                                ) : (
                                  <span className="text-rose-500 font-sans italic">Invalid</span>
                                )}
                                {row.previousBalances && (
                                  <span className="block text-[10px] text-slate-400 font-normal">
                                    was {row.previousBalances.casualLeave}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                {row.status === 'MATCHED_VALID' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                                    <CheckCircle2 size={12} />
                                    Ready
                                  </span>
                                )}
                                {row.status === 'MATCHED_WITH_WARNINGS' && (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold text-[11px]">
                                      <AlertTriangle size={12} />
                                      Ready (Warning)
                                    </span>
                                    <p className="text-[11px] text-amber-800 leading-snug">
                                      {row.warnings.join('; ')}
                                    </p>
                                  </div>
                                )}
                                {row.status === 'UNMATCHED_PHONE' && (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 font-bold text-[11px]">
                                      Unmatched (Skipped)
                                    </span>
                                    <p className="text-[11px] text-slate-600 leading-snug">
                                      Phone does not match existing worker records
                                    </p>
                                  </div>
                                )}
                                {(row.status === 'DUPLICATE_PHONE' || row.status === 'ERROR') && (
                                  <span className="text-rose-700 font-semibold leading-snug block">
                                    {row.errors.join('; ')}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* STAGE 3: TRANSACTION COMPLETE */}
          {stage === 'COMPLETE' && committedBatch && (
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-emerald-50 border-2 border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 size={26} />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-emerald-950">
                      {committedBatch.matchedWorkersUpdated} Worker Leave Balance
                      {committedBatch.matchedWorkersUpdated === 1 ? '' : 's'} Updated Atomically
                    </h4>
                    <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                      Saved as absolute <strong>Opening Balances</strong> effective{' '}
                      <strong className="font-mono">{committedBatch.migrationDate}</strong>. Future accruals will apply strictly from this date forward.
                      {committedBatch.unmatchedPhoneCount > 0 && (
                        <> {committedBatch.unmatchedPhoneCount} unmatched phone number(s) were skipped.</>
                      )}
                    </p>
                  </div>
                </div>
                <div className="text-right font-mono text-[11px] text-emerald-900 bg-white/80 px-3 py-2 rounded-xl border border-emerald-200 shrink-0">
                  <div className="font-bold">Batch ID</div>
                  <div>{committedBatch.id}</div>
                </div>
              </div>

              {committedBatch.negativeBalanceWorkersCount > 0 && (
                <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-950 flex items-center gap-2">
                  <Info size={15} className="text-indigo-600 shrink-0" />
                  <span>
                    <strong>{committedBatch.negativeBalanceWorkersCount}</strong> worker(s) imported with negative leave balances have been queued for deduction in the{' '}
                    <span className="font-mono font-bold">{committedBatch.migrationDate.slice(0, 7)}</span> payroll cycle.
                  </span>
                </div>
              )}

              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                      <tr className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                        <th className="py-2.5 px-3">Worker</th>
                        <th className="py-2.5 px-3">Phone</th>
                        <th className="py-2.5 px-3 text-right">Earned (EL)</th>
                        <th className="py-2.5 px-3 text-right">Sick (SL)</th>
                        <th className="py-2.5 px-3 text-right">Casual (CL)</th>
                        <th className="py-2.5 px-3">Accrual Start</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {committedRecords.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-bold text-slate-900">{rec.workerName}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">{rec.workerPhone}</td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono font-bold ${
                              rec.earnedLeave < 0 ? 'text-rose-700' : 'text-slate-900'
                            }`}
                          >
                            {rec.earnedLeave}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono font-bold ${
                              rec.sickLeave < 0 ? 'text-rose-700' : 'text-slate-900'
                            }`}
                          >
                            {rec.sickLeave}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono font-bold ${
                              rec.casualLeave < 0 ? 'text-rose-700' : 'text-slate-900'
                            }`}
                          >
                            {rec.casualLeave}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {rec.accrualStartDate}
                            {rec.negativeBalanceDays > 0 && (
                              <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-sans font-bold">
                                -{rec.negativeBalanceDays}d Payroll Deduction
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {stage === 'UPLOAD' && (
            <>
              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
                <span>
                  Transactional guarantee: if any failure or DB timeout occurs mid-import, 0 balances are updated.
                </span>
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
            </>
          )}

          {stage === 'PREVIEW' && validationResult && (
            <>
              <button
                type="button"
                disabled={committing}
                onClick={() => {
                  setStage('UPLOAD');
                  setValidationResult(null);
                  setTransactionError(null);
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ArrowLeft size={14} />
                <span>Upload Different File</span>
              </button>

              <div className="flex items-center flex-wrap gap-2">
                {(validationResult.unmatchedCount > 0 ||
                  validationResult.blockingErrorRows.length > 0 ||
                  validationResult.nameMismatchRows.length > 0) && (
                  <button
                    type="button"
                    disabled={committing}
                    onClick={handleDownloadReport}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Download Validation Report</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={committing || !validationResult.canCommit}
                  onClick={handleConfirmImport}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-black shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  {committing ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Committing Transaction...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>
                        Confirm Import ({validationResult.matchedCount}{' '}
                        {validationResult.matchedCount === 1 ? 'Worker' : 'Workers'})
                      </span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {stage === 'COMPLETE' && (
            <>
              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                <FileSpreadsheet size={14} className="text-emerald-600 shrink-0" />
                <span>Updated balances are now live across Workers Directory, Worker History &amp; Payroll.</span>
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold cursor-pointer"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
