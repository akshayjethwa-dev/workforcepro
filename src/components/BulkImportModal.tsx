// src/components/BulkImportModal.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  X,
  CheckCircle2,
  AlertTriangle,
  Download,
  RefreshCw,
  FileSpreadsheet,
  XCircle,
  Sparkles,
  Copy,
  Send,
  ShieldCheck,
  Building2,
  Clock,
  ArrowLeft,
  Link2,
} from 'lucide-react';
import { OrgSettings, Worker } from '../types/index';
import {
  employeeCapGuard,
  EmployeeCapExceededError,
} from '../services/employeeCapGuard';
import { dbService } from '../services/db';
import { magicLinkService } from '../services/magicLinkService';
import { resolveMinimumWageFloor } from '../services/minimumWageDatabase';
import { useToast } from '../contexts/ToastContext';
import { downloadWorkerImportTemplate } from '../utils/workerExcelTemplate';
import {
  createDemoValidationExcelFile,
  downloadGeneratedMagicLinksExcel,
  downloadImportErrorReport,
  ImportValidationResult,
  MAX_IMPORT_ROWS_PER_BATCH,
  parseAndValidateImportFile,
} from '../utils/workerImportEngine';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  orgSettings?: OrgSettings | null;
  existingWorkers?: Worker[];
  actorEmail?: string;
  onSuccess: () => void;
  onPaywallTrigger: (err: EmployeeCapExceededError) => void;
  onSwitchToLeaveBalances?: () => void;
}

interface CreatedWorkerLinkSummary {
  workerId: string;
  workerName: string;
  phone: string;
  role: string;
  monthlyCtc: number;
  magicLinkUrl: string;
  whatsappUrl: string;
}

type ModalStage = 'UPLOAD' | 'SUMMARY' | 'COMPLETE';

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  orgSettings,
  existingWorkers = [],
  actorEmail = 'admin@factory.in',
  onSuccess,
  onPaywallTrigger,
  onSwitchToLeaveBalances,
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const shifts = orgSettings?.shifts && orgSettings.shifts.length > 0
    ? orgSettings.shifts
    : [{ id: 'default', name: 'General Shift', startTime: '09:00', endTime: '18:00', gracePeriodMins: 15, halfDayMins: 240, fullDayMins: 480 }];

  const branches = orgSettings?.branches && orgSettings.branches.length > 0
    ? orgSettings.branches
    : [{ id: 'default', name: 'Main Unit', state: 'Gujarat', address: 'GIDC Industrial Area' }];

  const [selectedShiftId, setSelectedShiftId] = useState<string>(shifts[0]?.id || 'default');
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    branches.find((b) => (b.state || '').toLowerCase() === 'gujarat')?.id || branches[0]?.id || 'default'
  );

  const [stage, setStage] = useState<ModalStage>('UPLOAD');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [parsing, setParsing] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);

  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
  const [rowFilter, setRowFilter] = useState<'ALL' | 'VALID' | 'ERRORS'>('ALL');
  const [createdLinks, setCreatedLinks] = useState<CreatedWorkerLinkSummary[]>([]);

  useEffect(() => {
    if (isOpen) {
      if (!branches.some((b) => b.id === selectedBranchId)) {
        const defaultBranch =
          branches.find((b) => (b.state || '').toLowerCase() === 'gujarat') || branches[0];
        if (defaultBranch) setSelectedBranchId(defaultBranch.id);
      }
      if (!shifts.some((s) => s.id === selectedShiftId) && shifts[0]) {
        setSelectedShiftId(shifts[0].id);
      }
    } else {
      setStage('UPLOAD');
      setValidationResult(null);
      setRowFilter('ALL');
      setCreatedLinks([]);
      setParsing(false);
      setImporting(false);
    }
  }, [isOpen, orgSettings]);

  if (!isOpen) return null;

  const activeBranch = branches.find((b) => b.id === selectedBranchId) || branches[0];
  const activeShift = shifts.find((s) => s.id === selectedShiftId) || shifts[0];
  const activeState = activeBranch?.state || 'Gujarat';
  const activeMinWage = resolveMinimumWageFloor({
    state: activeState,
    skillCategory: 'SEMI_SKILLED',
    customRevisions: orgSettings?.compliance?.minimumWageRevisions,
  }).monthlyFloor;

  const runValidationForFile = async (file: File, branchOverride = activeBranch, shiftOverride = activeShift) => {
    setParsing(true);
    try {
      const liveExisting = existingWorkers.length > 0 ? existingWorkers : await dbService.getWorkers(tenantId);
      const result = await parseAndValidateImportFile({
        file,
        tenantId,
        existingWorkers: liveExisting,
        policy: {
          branchId: branchOverride?.id || 'default',
          branchName: branchOverride?.name || 'Main Unit',
          shiftId: shiftOverride?.id || 'default',
          shiftName: shiftOverride?.name || 'General Shift',
          state: branchOverride?.state || 'Gujarat',
          orgSettings,
        },
      });

      setValidationResult(result);
      if (result.ok) {
        setRowFilter(result.errorRows.length > 0 ? 'ALL' : 'VALID');
        setStage('SUMMARY');
      } else {
        setStage('UPLOAD');
      }
    } catch (err) {
      console.error('File validation failed:', err);
      toast.error('Failed to validate the uploaded file.');
    } finally {
      setParsing(false);
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

  const handleDownloadTemplate = () => {
    try {
      const fileName = downloadWorkerImportTemplate();
      toast.success(`Downloaded ${fileName} (includes Sample Data & Read Me sheet).`);
    } catch {
      toast.error('Unable to download Excel template.');
    }
  };

  const handleTrySampleFile = async () => {
    const demoFile = createDemoValidationExcelFile();
    await runValidationForFile(demoFile);
  };

  const handleDownloadErrorReport = () => {
    if (!validationResult) return;
    try {
      const fileName = downloadImportErrorReport(validationResult);
      toast.success(`Downloaded ${fileName} with "Error Reason" column.`);
    } catch (err) {
      console.error('Error report export failed:', err);
      toast.error('Failed to generate error report.');
    }
  };

  const handleProceedWithValidWorkers = async () => {
    if (!validationResult || validationResult.validRows.length === 0) return;

    const validPayloads = validationResult.validRows
      .map((r) => r.workerPayload)
      .filter((p): p is Partial<Worker> => Boolean(p));

    setImporting(true);
    try {
      // 1. Check subscription employee cap guard
      await employeeCapGuard.validateBatchImport(tenantId, validPayloads);

      // 2. Create all valid worker profiles atomically
      const createdIds = await dbService.bulkAddWorkers(tenantId, validPayloads);

      // 3. Fetch created workers and generate Magic Links for each newly onboarded worker
      const latestWorkers = await dbService.getWorkers(tenantId);
      const idSet = new Set(createdIds);
      const newlyCreatedWorkers = latestWorkers.filter((w) => idSet.has(w.id));

      const generatedSummaries: CreatedWorkerLinkSummary[] = [];
      for (const worker of newlyCreatedWorkers) {
        try {
          const linkRes = await magicLinkService.createWorkerMagicLink({
            tenantId,
            worker,
            scope: 'PUNCH',
            channel: 'WHATSAPP',
            issuedBy: actorEmail,
            ttlHours: 72,
            shiftId: activeShift?.id || 'default',
          });
          generatedSummaries.push({
            workerId: worker.id,
            workerName: worker.name,
            phone: worker.phone,
            role: worker.designation,
            monthlyCtc: worker.wageConfig?.amount || 0,
            magicLinkUrl: linkRes.localUrl || linkRes.universalUrl,
            whatsappUrl: linkRes.whatsappUrl,
          });
        } catch (linkErr) {
          console.warn(`Magic link generation skipped for ${worker.name}:`, linkErr);
        }
      }

      setCreatedLinks(generatedSummaries);
      setStage('COMPLETE');
      onSuccess();
      toast.success(
        `Imported ${validPayloads.length} valid worker${validPayloads.length === 1 ? '' : 's'} and generated Magic Links.`
      );
    } catch (err: any) {
      if (err instanceof EmployeeCapExceededError || err?.code === 'EMPLOYEE_CAP_EXCEEDED') {
        onClose();
        onPaywallTrigger(err);
      } else {
        toast.error(err?.message || 'Import failed. Please try again.');
      }
    } finally {
      setImporting(false);
    }
  };

  const visibleRows = validationResult
    ? rowFilter === 'VALID'
      ? validationResult.validRows
      : rowFilter === 'ERRORS'
      ? validationResult.errorRows
      : validationResult.allRows
    : [];

  return (
    <div className="fixed inset-0 bg-slate-950/75 z-50 flex items-center justify-center p-3 sm:p-5 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <FileSpreadsheet size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold tracking-tight truncate">
                  {stage === 'UPLOAD'
                    ? 'Bulk Import Workers (Excel / CSV)'
                    : stage === 'SUMMARY'
                    ? 'Validation Summary & Preview'
                    : 'Import Complete & Magic Links Ready'}
                </h3>
                {onSwitchToLeaveBalances && stage === 'UPLOAD' && (
                  <button
                    type="button"
                    onClick={onSwitchToLeaveBalances}
                    className="text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-indigo-500/30 hover:bg-indigo-500/50 border border-indigo-400/40 text-indigo-100 transition-colors cursor-pointer"
                  >
                    Switch to Leave Balances Import
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-300 truncate">
                {stage === 'UPLOAD'
                  ? 'Upload your filled template (.xlsx or .csv, up to 5MB, max 500 rows per batch)'
                  : stage === 'SUMMARY'
                  ? `${validationResult?.fileName} • Checked against ${validationResult?.stateUsed} Minimum Wage (₹${validationResult?.minimumWageFloor.toLocaleString('en-IN')})`
                  : `${createdLinks.length} worker profiles created and assigned to ${activeShift?.name}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* STAGE 1: UPLOAD & POLICY SELECTION */}
          {stage === 'UPLOAD' && (
            <>
              {/* Policy Assignment Bar */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                    1. Select Policy to Assign Imported Workers
                  </span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md">
                    {activeState} Min Wage Floor: ₹{activeMinWage.toLocaleString('en-IN')}/mo
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                      <Building2 size={13} className="text-slate-500" />
                      <span>Site / Branch Policy</span>
                    </label>
                    <select
                      value={selectedBranchId}
                      onChange={(e) => setSelectedBranchId(e.target.value)}
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.state || 'Gujarat'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                      <Clock size={13} className="text-slate-500" />
                      <span>Shift &amp; Attendance Policy</span>
                    </label>
                    <select
                      value={selectedShiftId}
                      onChange={(e) => setSelectedShiftId(e.target.value)}
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
                    >
                      {shifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.startTime} – {s.endTime})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Fatal Validation Error Alert (Invalid Headers / >500 rows / >5MB) */}
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
                    {validationResult.fatalErrorCode === 'INVALID_HEADERS' && (
                      <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-rose-900 underline underline-offset-2 hover:text-rose-950 cursor-pointer"
                      >
                        <Download size={13} />
                        <span>Download the official Excel template</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Drag & Drop File Upload Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`p-7 sm:p-9 rounded-2xl border-2 border-dashed transition-all text-center flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? 'border-blue-600 bg-blue-50/70'
                    : 'border-slate-300 bg-slate-50/50 hover:border-blue-400 hover:bg-blue-50/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  {parsing ? (
                    <RefreshCw size={26} className="animate-spin" />
                  ) : (
                    <Upload size={26} />
                  )}
                </div>

                <div className="space-y-1 max-w-md">
                  <h4 className="text-sm sm:text-base font-bold text-slate-900">
                    {parsing
                      ? 'Parsing & validating rows...'
                      : 'Drop your filled Excel (.xlsx) or CSV file here'}
                  </h4>
                  <p className="text-xs text-slate-500">
                    Max file size: <strong>5MB</strong> · Max <strong>{MAX_IMPORT_ROWS_PER_BATCH} rows</strong> per batch.
                    Required headers: <span className="font-semibold text-slate-700">Worker Name, Phone Number, Role, Monthly CTC, Date of Joining</span> (optional: UAN, PAN).
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={parsing}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Upload size={15} />
                    <span>Choose Excel / CSV File</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={15} />
                    <span>Download Template</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={parsing}
                  onClick={handleTrySampleFile}
                  className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 underline underline-offset-2 cursor-pointer"
                >
                  <Sparkles size={13} />
                  <span>Try with a sample Excel file (5 valid rows + 3 sample errors)</span>
                </button>
              </div>
            </>
          )}

          {/* STAGE 2: VALIDATION SUMMARY & PREVIEW SCREEN */}
          {stage === 'SUMMARY' && validationResult && (
            <>
              {/* Headline Validation Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-200 flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <div className="text-lg sm:text-xl font-black text-emerald-950">
                      {validationResult.validRows.length}{' '}
                      {validationResult.validRows.length === 1 ? 'worker' : 'workers'} ready to import.
                    </div>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      Passed phone, minimum wage (₹{validationResult.minimumWageFloor.toLocaleString('en-IN')}), date &amp; duplicate checks.
                    </p>
                  </div>
                </div>

                {validationResult.errorRows.length > 0 ? (
                  <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-200 flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                      <AlertTriangle size={24} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-lg sm:text-xl font-black text-rose-950">
                        {validationResult.errorRows.length}{' '}
                        {validationResult.errorRows.length === 1 ? 'error' : 'errors'} found.
                      </div>
                      <button
                        type="button"
                        onClick={handleDownloadErrorReport}
                        className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-extrabold text-rose-800 hover:text-rose-950 underline underline-offset-2 cursor-pointer text-left"
                      >
                        <Download size={13} className="shrink-0" />
                        <span>Click here to download the error report.</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-blue-50 border-2 border-blue-200 flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <ShieldCheck size={24} />
                    </div>
                    <div>
                      <div className="text-lg sm:text-xl font-black text-blue-950">
                        0 errors found.
                      </div>
                      <p className="text-xs text-blue-800 mt-0.5">
                        Every row in {validationResult.fileName} is clean and ready to onboard.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Filter Tabs + Policy Context */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold gap-1">
                  <button
                    type="button"
                    onClick={() => setRowFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      rowFilter === 'ALL'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Rows ({validationResult.totalRows})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRowFilter('VALID')}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      rowFilter === 'VALID'
                        ? 'bg-white text-emerald-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Valid ({validationResult.validRows.length})
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
                    Errors ({validationResult.errorRows.length})
                  </button>
                </div>

                <div className="text-xs text-slate-500 font-medium">
                  Policy: <strong className="text-slate-800">{activeBranch?.name}</strong> ·{' '}
                  <strong className="text-slate-800">{activeShift?.name}</strong>
                </div>
              </div>

              {/* Row-by-Row Preview Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                      <tr className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                        <th className="py-2.5 px-3">Row</th>
                        <th className="py-2.5 px-3">Worker Name</th>
                        <th className="py-2.5 px-3">Phone Number</th>
                        <th className="py-2.5 px-3">Role</th>
                        <th className="py-2.5 px-3">Monthly CTC</th>
                        <th className="py-2.5 px-3">Joining Date</th>
                        <th className="py-2.5 px-3">Status / Error Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleRows.map((row) => (
                        <tr
                          key={row.rowNumber}
                          className={row.isValid ? 'hover:bg-slate-50/70' : 'bg-rose-50/50 hover:bg-rose-50/80'}
                        >
                          <td className="py-2.5 px-3 font-mono text-slate-400">#{row.rowNumber}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {row.workerName || <span className="text-rose-500 italic">Missing</span>}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">
                            {row.phone || <span className="text-rose-500 italic font-sans">Missing</span>}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {row.role || <span className="text-rose-500 italic">Missing</span>}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                            {row.monthlyCtc !== null
                              ? `₹${row.monthlyCtc.toLocaleString('en-IN')}`
                              : <span className="text-rose-500 italic font-sans">Invalid</span>}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {row.dateOfJoiningRaw || <span className="text-rose-500 italic font-sans">Missing</span>}
                          </td>
                          <td className="py-2.5 px-3">
                            {row.isValid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                                <CheckCircle2 size={12} />
                                Ready
                              </span>
                            ) : (
                              <span className="text-rose-700 font-semibold leading-snug block">
                                {row.errorReason}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* STAGE 3: IMPORT COMPLETE & GENERATED MAGIC LINKS */}
          {stage === 'COMPLETE' && (
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-emerald-50 border-2 border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 size={26} />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-emerald-950">
                      {createdLinks.length} Worker Profile{createdLinks.length === 1 ? '' : 's'} Created &amp; Magic Links Ready
                    </h4>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      Assigned to <strong>{activeBranch?.name}</strong> ({activeShift?.name}). Share Magic Links below so workers can start punching in immediately.
                    </p>
                  </div>
                </div>

                {createdLinks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const outName = downloadGeneratedMagicLinksExcel(createdLinks);
                      toast.success(`Exported ${outName}`);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Export Magic Links (.xlsx)</span>
                  </button>
                )}
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {createdLinks.map((item) => (
                  <div
                    key={item.workerId}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-slate-50/70"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">{item.workerName}</span>
                        <span className="text-xs text-slate-500">• {item.role}</span>
                        <span className="text-xs font-mono text-slate-500">• {item.phone}</span>
                      </div>
                      <div className="text-[11px] font-mono text-blue-700 truncate mt-1 flex items-center gap-1">
                        <Link2 size={12} className="shrink-0" />
                        <span className="truncate">{item.magicLinkUrl}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(item.magicLinkUrl);
                          toast.success(`Copied Magic Link for ${item.workerName}`);
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Copy size={12} />
                        <span>Copy</span>
                      </button>
                      <a
                        href={item.whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <Send size={12} />
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {stage === 'UPLOAD' && (
            <>
              <span className="text-xs text-slate-500">
                Validates phone numbers, {activeState} minimum wage, duplicates, and optional UAN/PAN before saving.
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

          {stage === 'SUMMARY' && validationResult && (
            <>
              <button
                type="button"
                disabled={importing}
                onClick={() => {
                  setStage('UPLOAD');
                  setValidationResult(null);
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Upload Different File</span>
              </button>

              <div className="flex items-center flex-wrap gap-2">
                {validationResult.errorRows.length > 0 && (
                  <button
                    type="button"
                    disabled={importing}
                    onClick={handleDownloadErrorReport}
                    className="px-4 py-2.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Download Error Report</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={importing || validationResult.validRows.length === 0}
                  onClick={handleProceedWithValidWorkers}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-black shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  {importing ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Importing &amp; Generating Magic Links...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>
                        Proceed with {validationResult.validRows.length} valid{' '}
                        {validationResult.validRows.length === 1 ? 'worker' : 'workers'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {stage === 'COMPLETE' && (
            <>
              <span className="text-xs text-slate-500">
                All imported workers are now visible in your Workers Directory.
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
