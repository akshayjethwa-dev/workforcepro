import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  History,
  IndianRupee,
  Landmark,
  Loader2,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  ActiveLoan,
  LoanLedgerImportBatch,
  OrgSettings,
  Worker,
} from '../types/index';
import {
  LOAN_LEDGER_TEMPLATE_FILENAME,
  downloadLoanLedgerTemplate,
} from '../utils/workerExcelTemplate';
import {
  LOAN_LEDGER_REQUIRED_HEADERS,
  LoanLedgerRowOverride,
  LoanLedgerValidationResult,
  applyLoanLedgerEmiOverrides,
  commitLoanLedgerImport,
  createDemoLoanLedgerExcelFile,
  downloadLoanLedgerValidationReport,
  parseAndValidateLoanLedgerFile,
} from '../utils/workerImportEngine';
import {
  calculateMonthlyLoanRecoverySummary,
  formatInrWhole,
} from '../services/PayrollEngine';
import { dbService } from '../services/db';
import { useToast } from '../contexts/ToastContext';

interface BulkLoanLedgerImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  orgSettings?: OrgSettings | null;
  existingWorkers: Worker[];
  actorEmail: string;
  defaultStartMonth?: string; // YYYY-MM
  onSuccess: () => void;
}

type ModalStage = 'UPLOAD' | 'PREVIEW' | 'COMPLETE';
type PreviewFilter = 'ALL' | 'ACTIVE' | 'WARNINGS' | 'SETTLED' | 'UNMATCHED' | 'ERRORS';

export const BulkLoanLedgerImportModal: React.FC<BulkLoanLedgerImportModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  orgSettings,
  existingWorkers,
  actorEmail,
  defaultStartMonth,
  onSuccess,
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<ModalStage>('UPLOAD');
  const [startMonth, setStartMonth] = useState<string>(
    defaultStartMonth || new Date().toISOString().slice(0, 7)
  );
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);

  const [baseValidation, setBaseValidation] = useState<LoanLedgerValidationResult | null>(null);
  const [emiOverrides, setEmiOverrides] = useState<Record<number, LoanLedgerRowOverride>>({});
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>('ALL');
  const [commitError, setCommitError] = useState<string | null>(null);

  const [commitResult, setCommitResult] = useState<{
    batch: LoanLedgerImportBatch;
    createdLoans: ActiveLoan[];
    summaryMessage: string;
  } | null>(null);

  // Existing active loans & import history
  const [existingLoans, setExistingLoans] = useState<ActiveLoan[]>([]);
  const [importHistory, setImportHistory] = useState<LoanLedgerImportBatch[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [showExistingLoans, setShowExistingLoans] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const loadExistingLoansAndHistory = async () => {
    if (!tenantId) return;
    setLoadingLedger(true);
    try {
      const [loans, batches] = await Promise.all([
        dbService.getActiveLoans(tenantId),
        dbService.getLoanLedgerImportHistory(tenantId),
      ]);
      setExistingLoans(loans);
      setImportHistory(batches);
    } catch {
      // non-fatal
    } finally {
      setLoadingLedger(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (defaultStartMonth) setStartMonth(defaultStartMonth);
      loadExistingLoansAndHistory();
    }
  }, [isOpen, tenantId, defaultStartMonth]);

  // Live recalculated validation result whenever inline EMI overrides change
  const effectiveValidation = useMemo(() => {
    if (!baseValidation) return null;
    if (!baseValidation.ok) return baseValidation;
    return applyLoanLedgerEmiOverrides(baseValidation, emiOverrides);
  }, [baseValidation, emiOverrides]);

  const existingLoansSummary = useMemo(
    () => calculateMonthlyLoanRecoverySummary(existingLoans, startMonth),
    [existingLoans, startMonth]
  );

  if (!isOpen) return null;

  const resetModal = () => {
    setStage('UPLOAD');
    setBaseValidation(null);
    setEmiOverrides({});
    setPreviewFilter('ALL');
    setCommitError(null);
    setCommitResult(null);
    setParsing(false);
    setCommitting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (committing) return;
    resetModal();
    onClose();
  };

  const handleDownloadTemplate = (prefillExistingWorkers: boolean) => {
    try {
      const fileName = downloadLoanLedgerTemplate({
        existingWorkers,
        prefillExistingWorkers,
      });
      toast.success(
        prefillExistingWorkers
          ? `Downloaded ${fileName} pre-filled with your active workers' phone numbers.`
          : `Downloaded ${fileName} with sample loan entries and Read Me instructions.`
      );
    } catch (err) {
      console.error('Loan template download failed:', err);
      toast.error('Unable to generate Loan_Ledger_Template.xlsx. Please try again.');
    }
  };

  const processSelectedFile = async (file: File) => {
    setParsing(true);
    setCommitError(null);
    setEmiOverrides({});
    try {
      const result = await parseAndValidateLoanLedgerFile({
        file,
        tenantId,
        existingWorkers,
        orgSettings,
        startMonth,
      });
      setBaseValidation(result);
      if (result.ok) {
        setStage('PREVIEW');
        if (result.errorCount > 0) {
          setPreviewFilter('ERRORS');
        } else if (result.emiWarningCount > 0) {
          setPreviewFilter('ALL');
        } else {
          setPreviewFilter('ALL');
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to parse the uploaded loan ledger file.');
    } finally {
      setParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processSelectedFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processSelectedFile(file);
  };

  const handleLoadSample = () => {
    const sampleFile = createDemoLoanLedgerExcelFile(existingWorkers);
    processSelectedFile(sampleFile);
  };

  const handleInlineEmiChange = (rowNumber: number, rawValue: string) => {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return;
    }
    setEmiOverrides((prev) => ({
      ...prev,
      [rowNumber]: {
        ...prev[rowNumber],
        monthlyEmi: Math.round(numeric * 100) / 100,
      },
    }));
  };

  const handleInlineInstallmentsChange = (rowNumber: number, rawValue: string) => {
    const numeric = Math.round(Number(rawValue));
    if (!Number.isFinite(numeric) || numeric < 1) {
      return;
    }
    setEmiOverrides((prev) => ({
      ...prev,
      [rowNumber]: {
        ...prev[rowNumber],
        remainingInstallments: numeric,
      },
    }));
  };

  const handleConfirmImport = async () => {
    if (!baseValidation || !effectiveValidation || !effectiveValidation.canCommit) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const { batch, createdLoans, effectiveResult } = await commitLoanLedgerImport({
        tenantId,
        validationResult: baseValidation,
        actorEmail,
        startMonth,
        emiOverrides,
      });

      setCommitResult({
        batch,
        createdLoans,
        summaryMessage: effectiveResult.summaryMessage,
      });
      setStage('COMPLETE');
      await loadExistingLoansAndHistory();
      onSuccess();
      toast.success(
        `Created ${createdLoans.length} ActiveLoan record${
          createdLoans.length === 1 ? '' : 's'
        }. ${effectiveResult.summaryMessage}`
      );
    } catch (err: any) {
      const msg = err?.message || 'Loan ledger import failed and was rolled back.';
      setCommitError(msg);
      toast.error(msg);
    } finally {
      setCommitting(false);
    }
  };

  const handleToggleLoanStatus = async (loan: ActiveLoan) => {
    const nextStatus = loan.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await dbService.updateActiveLoan(tenantId, loan.id, { status: nextStatus });
      await loadExistingLoansAndHistory();
      onSuccess();
      toast.success(
        `${loan.workerName}'s loan recovery ${nextStatus === 'PAUSED' ? 'paused' : 'resumed'}.`
      );
    } catch {
      toast.error('Could not update loan status.');
    }
  };

  const handleDeleteLoan = async (loan: ActiveLoan) => {
    try {
      await dbService.deleteActiveLoan(tenantId, loan.id);
      await loadExistingLoansAndHistory();
      onSuccess();
      toast.success(`Removed loan record for ${loan.workerName}.`);
    } catch {
      toast.error('Could not delete loan record.');
    }
  };

  const filteredPreviewRows = (() => {
    if (!effectiveValidation?.ok) return [];
    switch (previewFilter) {
      case 'ACTIVE':
        return effectiveValidation.activeRows;
      case 'WARNINGS':
        return effectiveValidation.emiWarningRows;
      case 'SETTLED':
        return effectiveValidation.settledRows;
      case 'UNMATCHED':
        return effectiveValidation.unmatchedRows;
      case 'ERRORS':
        return effectiveValidation.blockingErrorRows;
      default:
        return effectiveValidation.allRows;
    }
  })();

  const activeWorkerCount = existingWorkers.filter(
    (w) =>
      w.status !== 'RESIGNED' &&
      w.status !== 'TERMINATED' &&
      w.status !== 'INACTIVE' &&
      w.isActive !== false
  ).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* HEADER */}
        <div className="px-5 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">
              <Landmark size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold tracking-tight truncate">
                Bulk Advance / Loan Ledger Import
              </h2>
              <p className="text-xs text-slate-300 truncate">
                Upload outstanding worker loans via {LOAN_LEDGER_TEMPLATE_FILENAME} for automatic
                monthly EMI recovery on payslips
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={committing}
            aria-label="Close bulk loan ledger import modal"
            className="p-2 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* STAGE INDICATOR */}
        <div className="px-5 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap text-xs shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 font-semibold">
            <span
              className={`inline-flex items-center gap-1.5 ${
                stage === 'UPLOAD' ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  stage === 'UPLOAD'
                    ? 'bg-amber-600 text-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                1
              </span>
              Upload Ledger
            </span>
            <span className="text-slate-300">→</span>
            <span
              className={`inline-flex items-center gap-1.5 ${
                stage === 'PREVIEW'
                  ? 'text-amber-700'
                  : stage === 'COMPLETE'
                  ? 'text-emerald-700'
                  : 'text-slate-400'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  stage === 'PREVIEW'
                    ? 'bg-amber-600 text-white'
                    : stage === 'COMPLETE'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                2
              </span>
              Validate &amp; Adjust EMIs
            </span>
            <span className="text-slate-300">→</span>
            <span
              className={`inline-flex items-center gap-1.5 ${
                stage === 'COMPLETE' ? 'text-emerald-700' : 'text-slate-400'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  stage === 'COMPLETE'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                3
              </span>
              Active Loans Synced
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Auto-deducted as &ldquo;Loan Recovery&rdquo; by PayrollEngine</span>
          </div>
        </div>

        {/* BODY */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* STAGE 1: UPLOAD */}
          {stage === 'UPLOAD' && (
            <>
              {/* Step 1A: Recovery Start Month + Download Template */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-7 bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <FileSpreadsheet size={16} className="text-amber-600" />
                        <span>Step 1: Download {LOAN_LEDGER_TEMPLATE_FILENAME}</span>
                      </h3>
                      <p className="text-xs text-slate-600 mt-1">
                        Fill in outstanding loan balances from your old software. Rows with{' '}
                        <span className="font-semibold text-slate-800">₹0 Outstanding Principal</span>{' '}
                        are automatically skipped as settled.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate(activeWorkerCount > 0)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      <Download size={14} />
                      <span>
                        {activeWorkerCount > 0
                          ? `Download Pre-filled (${activeWorkerCount} Workers)`
                          : `Download ${LOAN_LEDGER_TEMPLATE_FILENAME}`}
                      </span>
                    </button>
                    {activeWorkerCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleDownloadTemplate(false)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                      >
                        <Download size={14} />
                        <span>Sample Template</span>
                      </button>
                    )}
                  </div>

                  <div className="pt-1 text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-700">Required Columns:</span>{' '}
                    {LOAN_LEDGER_REQUIRED_HEADERS.join(' · ')}
                  </div>
                </div>

                <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between gap-3">
                  <div>
                    <label
                      htmlFor="loan-recovery-start-month"
                      className="text-xs font-bold text-slate-800 flex items-center gap-1.5"
                    >
                      <Calendar size={14} className="text-slate-500" />
                      <span>EMI Recovery Start Month</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      PayrollEngine starts adding &ldquo;Loan Recovery&rdquo; deductions from this
                      payroll month onward.
                    </p>
                    <input
                      id="loan-recovery-start-month"
                      type="month"
                      value={startMonth}
                      onChange={(e) => e.target.value && setStartMonth(e.target.value)}
                      className="mt-2 w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-600"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleLoadSample}
                    disabled={parsing}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles size={14} className="text-amber-600" />
                    <span>Test with Sample Loan Ledger (.xlsx)</span>
                  </button>
                </div>
              </div>

              {/* Step 1B: Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => !parsing && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                  isDragging
                    ? 'border-amber-500 bg-amber-50/70'
                    : 'border-slate-300 hover:border-amber-400 hover:bg-slate-50/70'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {parsing ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <Loader2 size={28} className="text-amber-600 animate-spin" />
                    <p className="text-sm font-bold text-slate-900">
                      Matching phone numbers &amp; checking EMI against worker salaries...
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
                      <Upload size={22} />
                    </div>
                    <p className="text-sm font-bold text-slate-900">
                      Drop your filled Loan Ledger Excel/CSV file here, or click to browse
                    </p>
                    <p className="text-xs text-slate-500">
                      Supports .xlsx, .xls, .csv up to 5 MB (max 495 loans per atomic batch)
                    </p>
                  </div>
                )}
              </div>

              {/* Fatal Parse Error Banner */}
              {baseValidation && !baseValidation.ok && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
                  <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                  <div className="min-w-0 text-xs">
                    <p className="font-bold text-rose-900">{baseValidation.fatalError}</p>
                    {baseValidation.fatalDetail && (
                      <p className="text-rose-700 mt-1">{baseValidation.fatalDetail}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Existing Active Loans Ledger Collapsible */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowExistingLoans((v) => !v)}
                  className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <IndianRupee size={15} className="text-amber-700 shrink-0" />
                    <span className="text-xs font-bold text-slate-800">
                      Active Loan Ledger ({existingLoans.length})
                    </span>
                    {existingLoansSummary.totalMonthlyRecovery > 0 && (
                      <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-lg truncate">
                        {existingLoansSummary.summaryMessage}
                      </span>
                    )}
                  </div>
                  {showExistingLoans ? (
                    <ChevronUp size={16} className="text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown size={16} className="text-slate-500 shrink-0" />
                  )}
                </button>

                {showExistingLoans && (
                  <div className="p-4 border-t border-slate-200 bg-white">
                    {loadingLedger ? (
                      <div className="text-xs text-slate-500 flex items-center gap-2 py-2">
                        <Loader2 size={14} className="animate-spin" />
                        <span>Loading active loans...</span>
                      </div>
                    ) : existingLoans.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No ActiveLoan records imported yet. Upload a Loan Ledger Excel file above to
                        begin automatic EMI deductions.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-[11px] uppercase text-slate-500 bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="py-2 px-3">Worker</th>
                              <th className="py-2 px-3 text-right">Total Loan</th>
                              <th className="py-2 px-3 text-right">Outstanding</th>
                              <th className="py-2 px-3 text-right">Monthly EMI</th>
                              <th className="py-2 px-3 text-center">EMIs Left</th>
                              <th className="py-2 px-3">Status</th>
                              <th className="py-2 px-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {existingLoans.map((loan) => (
                              <tr key={loan.id} className="hover:bg-slate-50/60">
                                <td className="py-2 px-3">
                                  <div className="font-semibold text-slate-900">
                                    {loan.workerName}
                                  </div>
                                  <div className="text-[11px] font-mono text-slate-500">
                                    {loan.workerPhone}
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                                  {formatInrWhole(loan.totalLoanAmount)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                                  {formatInrWhole(loan.outstandingPrincipal)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-amber-800">
                                  {formatInrWhole(loan.monthlyEmi)}
                                </td>
                                <td className="py-2 px-3 text-center font-mono tabular-nums text-slate-700">
                                  {loan.remainingInstallments}
                                </td>
                                <td className="py-2 px-3">
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      loan.status === 'ACTIVE'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : loan.status === 'PAUSED'
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {loan.status}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleLoanStatus(loan)}
                                      title={
                                        loan.status === 'ACTIVE'
                                          ? 'Pause EMI recovery'
                                          : 'Resume EMI recovery'
                                      }
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-amber-700 hover:bg-amber-50 cursor-pointer"
                                    >
                                      {loan.status === 'ACTIVE' ? (
                                        <PauseCircle size={14} />
                                      ) : (
                                        <PlayCircle size={14} />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteLoan(loan)}
                                      title="Delete loan record"
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Recent Import History Collapsible */}
              {importHistory.length > 0 && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowHistory((v) => !v)}
                    className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      <History size={15} className="text-slate-500" />
                      <span>Recent Loan Ledger Import Batches ({importHistory.length})</span>
                    </div>
                    {showHistory ? (
                      <ChevronUp size={16} className="text-slate-500" />
                    ) : (
                      <ChevronDown size={16} className="text-slate-500" />
                    )}
                  </button>
                  {showHistory && (
                    <div className="p-4 border-t border-slate-200 space-y-2">
                      {importHistory.slice(0, 6).map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between gap-2 flex-wrap text-xs bg-slate-50 rounded-xl px-3 py-2 border border-slate-100"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-900">{b.fileName}</span>
                            <span className="text-slate-400 mx-1.5">·</span>
                            <span className="text-slate-500">
                              {new Date(b.importedAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span className="text-emerald-700 font-bold">
                              {b.loansCreatedCount} loans
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-amber-800 font-bold">
                              {formatInrWhole(b.totalMonthlyRecovery)}/mo
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold ${
                                b.status === 'COMMITTED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {b.status}
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
          {stage === 'PREVIEW' && effectiveValidation && effectiveValidation.ok && (
            <>
              {/* Monthly Recovery Summary Banner (Exact AC #5 wording) */}
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                    Monthly Payroll Deduction Summary ({startMonth})
                  </div>
                  <p className="text-base sm:text-lg font-extrabold text-slate-950">
                    {effectiveValidation.summaryMessage}
                  </p>
                  <p className="text-xs text-slate-600">
                    {effectiveValidation.activeLoansCount} active loan
                    {effectiveValidation.activeLoansCount === 1 ? '' : 's'} to create · Total
                    outstanding principal{' '}
                    <span className="font-mono font-bold text-slate-900">
                      {formatInrWhole(effectiveValidation.totalOutstandingPrincipal)}
                    </span>
                    {effectiveValidation.settledSkippedCount > 0 && (
                      <>
                        {' '}
                        ·{' '}
                        <span className="font-semibold text-slate-700">
                          {effectiveValidation.settledSkippedCount} settled (₹0) skipped
                        </span>
                      </>
                    )}
                    {effectiveValidation.unmatchedCount > 0 && (
                      <>
                        {' '}
                        ·{' '}
                        <span className="font-semibold text-amber-800">
                          {effectiveValidation.unmatchedCount} phone
                          {effectiveValidation.unmatchedCount === 1 ? '' : 's'} unmatched
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {Object.keys(emiOverrides).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setEmiOverrides({})}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      <RotateCcw size={13} />
                      <span>Reset Edits</span>
                    </button>
                  )}
                </div>
              </div>

              {/* EMI Exceeds Salary Warning Callout */}
              {effectiveValidation.emiWarningCount > 0 && (
                <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                      <AlertTriangle size={17} className="text-rose-600 shrink-0" />
                      <span>
                        {effectiveValidation.emiWarningCount} worker
                        {effectiveValidation.emiWarningCount === 1 ? ' has' : 's have'} Monthly EMI
                        exceeding estimated net salary
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('WARNINGS')}
                      className="text-xs font-bold text-rose-800 underline hover:text-rose-950 cursor-pointer"
                    >
                      Filter flagged rows
                    </button>
                  </div>
                  <ul className="space-y-1 text-xs text-rose-800 pl-6 list-disc">
                    {effectiveValidation.emiWarningRows.map((row) => (
                      <li key={row.rowNumber}>
                        <span className="font-semibold">{row.emiWarningMessage}</span>{' '}
                        <span className="text-rose-700">
                          (Row {row.rowNumber}: EMI {formatInrWhole(row.monthlyEmi || 0)} vs est.
                          net salary {formatInrWhole(row.estimatedNetSalary || 0)} — edit the EMI
                          directly in the table below.)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Blocking Error Callout */}
              {effectiveValidation.blockReason && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-rose-900">
                  <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Import Blocked:</span>{' '}
                    {effectiveValidation.blockReason}
                  </div>
                </div>
              )}

              {commitError && (
                <div className="bg-rose-50 border border-rose-300 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-rose-900">
                  <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  <div>{commitError}</div>
                </div>
              )}

              {/* Filter Tabs */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold">
                  {(
                    [
                      { id: 'ALL', label: `All (${effectiveValidation.totalRows})` },
                      {
                        id: 'ACTIVE',
                        label: `Active Loans (${effectiveValidation.activeLoansCount})`,
                      },
                      {
                        id: 'WARNINGS',
                        label: `EMI Warnings (${effectiveValidation.emiWarningCount})`,
                      },
                      {
                        id: 'SETTLED',
                        label: `Settled Skipped (${effectiveValidation.settledSkippedCount})`,
                      },
                      {
                        id: 'UNMATCHED',
                        label: `Unmatched (${effectiveValidation.unmatchedCount})`,
                      },
                      ...(effectiveValidation.errorCount > 0
                        ? [{ id: 'ERRORS', label: `Errors (${effectiveValidation.errorCount})` }]
                        : []),
                    ] as Array<{ id: PreviewFilter; label: string }>
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPreviewFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-xl border transition-colors cursor-pointer ${
                        previewFilter === tab.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Validation Preview Table with Inline EMI Adjustment */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto max-h-[360px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3">Row</th>
                        <th className="py-2.5 px-3">Worker &amp; Phone</th>
                        <th className="py-2.5 px-3 text-right">Est. Net Salary</th>
                        <th className="py-2.5 px-3 text-right">Total Loan</th>
                        <th className="py-2.5 px-3 text-right">Outstanding</th>
                        <th className="py-2.5 px-3 text-right">Monthly EMI (Editable)</th>
                        <th className="py-2.5 px-3 text-center">EMIs Left</th>
                        <th className="py-2.5 px-3">Status &amp; Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPreviewRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400">
                            No rows match the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredPreviewRows.map((row) => {
                          const canEditInline =
                            row.status === 'MATCHED_ACTIVE' ||
                            row.status === 'MATCHED_EMI_WARNING';
                          return (
                            <tr
                              key={row.rowNumber}
                              className={
                                row.status === 'ERROR'
                                  ? 'bg-rose-50/60'
                                  : row.status === 'MATCHED_EMI_WARNING'
                                  ? 'bg-amber-50/70'
                                  : row.status === 'SKIPPED_SETTLED'
                                  ? 'bg-slate-50/70 text-slate-500'
                                  : ''
                              }
                            >
                              <td className="py-2.5 px-3 font-mono text-slate-500">
                                #{row.rowNumber}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-slate-900">
                                  {row.matchedWorkerName || (
                                    <span className="text-rose-600">Unmatched Worker</span>
                                  )}
                                </div>
                                <div className="font-mono text-[11px] text-slate-500">
                                  {row.normalizedPhone || row.rawPhone || '—'}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                                {row.estimatedNetSalary !== null
                                  ? formatInrWhole(row.estimatedNetSalary)
                                  : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                                {row.totalLoanAmount !== null
                                  ? formatInrWhole(row.totalLoanAmount)
                                  : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                                {row.outstandingPrincipal !== null
                                  ? formatInrWhole(row.outstandingPrincipal)
                                  : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {canEditInline ? (
                                  <div className="inline-flex items-center gap-1 justify-end">
                                    <span className="text-slate-400 font-bold">₹</span>
                                    <input
                                      type="number"
                                      min={1}
                                      step={100}
                                      aria-label={`Monthly EMI for ${row.matchedWorkerName}`}
                                      value={row.monthlyEmi ?? ''}
                                      onChange={(e) =>
                                        handleInlineEmiChange(row.rowNumber, e.target.value)
                                      }
                                      className={`w-24 px-2 py-1 text-right font-mono font-bold rounded-lg border outline-none ${
                                        row.emiExceedsSalaryWarning
                                          ? 'border-rose-400 bg-white text-rose-700 focus:border-rose-600'
                                          : 'border-slate-300 bg-white text-slate-900 focus:border-amber-600'
                                      }`}
                                    />
                                  </div>
                                ) : (
                                  <span className="font-mono tabular-nums text-slate-500">
                                    {row.monthlyEmi !== null ? formatInrWhole(row.monthlyEmi) : '—'}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {canEditInline ? (
                                  <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    aria-label={`Remaining installments for ${row.matchedWorkerName}`}
                                    value={row.remainingInstallments ?? ''}
                                    onChange={(e) =>
                                      handleInlineInstallmentsChange(row.rowNumber, e.target.value)
                                    }
                                    className="w-16 px-2 py-1 text-center font-mono font-semibold rounded-lg border border-slate-300 bg-white text-slate-900 outline-none focus:border-amber-600"
                                  />
                                ) : (
                                  <span className="font-mono tabular-nums text-slate-500">
                                    {row.remainingInstallments ?? '—'}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 max-w-[260px]">
                                <div className="flex flex-col gap-1">
                                  <span
                                    className={`inline-flex self-start px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      row.status === 'MATCHED_ACTIVE'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : row.status === 'MATCHED_EMI_WARNING'
                                        ? 'bg-amber-200 text-amber-950'
                                        : row.status === 'SKIPPED_SETTLED'
                                        ? 'bg-slate-200 text-slate-700'
                                        : row.status === 'UNMATCHED_PHONE'
                                        ? 'bg-orange-100 text-orange-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {row.status === 'MATCHED_ACTIVE'
                                      ? 'Active Loan Ready'
                                      : row.status === 'MATCHED_EMI_WARNING'
                                      ? 'EMI > Salary Warning'
                                      : row.status === 'SKIPPED_SETTLED'
                                      ? 'Settled · Skipped'
                                      : row.status === 'UNMATCHED_PHONE'
                                      ? 'Phone Not Found'
                                      : 'Validation Error'}
                                  </span>
                                  {row.notes && (
                                    <span
                                      className={`text-[11px] leading-snug ${
                                        row.status === 'ERROR'
                                          ? 'text-rose-700 font-medium'
                                          : row.status === 'MATCHED_EMI_WARNING'
                                          ? 'text-rose-800 font-semibold'
                                          : 'text-slate-500'
                                      }`}
                                    >
                                      {row.notes}
                                    </span>
                                  )}
                                </div>
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

          {/* STAGE 3: COMPLETE */}
          {stage === 'COMPLETE' && commitResult && (
            <div className="space-y-5">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-3.5">
                <CheckCircle2 size={24} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5 min-w-0">
                  <h3 className="text-base font-extrabold text-emerald-950">
                    {commitResult.createdLoans.length} ActiveLoan Record
                    {commitResult.createdLoans.length === 1 ? '' : 's'} Created Successfully
                  </h3>
                  <p className="text-sm font-bold text-slate-900">
                    {commitResult.summaryMessage}
                  </p>
                  <p className="text-xs text-emerald-800">
                    Batch <span className="font-mono font-bold">{commitResult.batch.id}</span> ·{' '}
                    PayrollEngine will automatically add a &ldquo;Loan Recovery&rdquo; deduction
                    line on each worker&rsquo;s monthly payslip starting{' '}
                    <span className="font-mono font-bold">{startMonth}</span>.
                    {commitResult.batch.settledSkippedCount > 0 && (
                      <>
                        {' '}
                        ({commitResult.batch.settledSkippedCount} settled ₹0 loan
                        {commitResult.batch.settledSkippedCount === 1 ? '' : 's'} automatically
                        skipped.)
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto max-h-[300px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Worker</th>
                        <th className="py-2.5 px-3 text-right">Total Loan</th>
                        <th className="py-2.5 px-3 text-right">Outstanding</th>
                        <th className="py-2.5 px-3 text-right">Monthly EMI</th>
                        <th className="py-2.5 px-3 text-center">Installments</th>
                        <th className="py-2.5 px-3">Payslip Deduction</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {commitResult.createdLoans.map((loan) => (
                        <tr key={loan.id}>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900">{loan.workerName}</div>
                            <div className="font-mono text-[11px] text-slate-500">
                              {loan.workerPhone}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                            {formatInrWhole(loan.totalLoanAmount)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {formatInrWhole(loan.outstandingPrincipal)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-amber-800">
                            {formatInrWhole(loan.monthlyEmi)}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono tabular-nums text-slate-700">
                            {loan.remainingInstallments}
                          </td>
                          <td className="py-2.5 px-3 text-emerald-700 font-semibold">
                            Loan Recovery ({formatInrWhole(Math.min(loan.monthlyEmi, loan.outstandingPrincipal))})
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

        {/* FOOTER */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 flex-wrap shrink-0">
          {stage === 'UPLOAD' && (
            <>
              <span className="text-xs text-slate-500">
                Matching against {existingWorkers.length} worker record
                {existingWorkers.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Close
              </button>
            </>
          )}

          {stage === 'PREVIEW' && effectiveValidation && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setStage('UPLOAD');
                    setBaseValidation(null);
                    setEmiOverrides({});
                    setCommitError(null);
                  }}
                  disabled={committing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
                >
                  <ArrowLeft size={14} />
                  <span>Upload Another File</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const out = downloadLoanLedgerValidationReport(effectiveValidation);
                      toast.success(`Downloaded ${out}`);
                    } catch {
                      toast.error('Could not export validation report.');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  <Download size={14} />
                  <span>Download Validation Report</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={!effectiveValidation.canCommit || committing}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                {committing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Creating ActiveLoan Records...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    <span>
                      Confirm Import ({effectiveValidation.activeLoansCount} Active Loan
                      {effectiveValidation.activeLoansCount === 1 ? '' : 's'})
                    </span>
                  </>
                )}
              </button>
            </>
          )}

          {stage === 'COMPLETE' && (
            <>
              <button
                type="button"
                onClick={resetModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <Upload size={14} />
                <span>Import Another File</span>
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
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
