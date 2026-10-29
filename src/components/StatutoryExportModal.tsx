import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Download, ShieldCheck, AlertTriangle, CheckCircle2, FileText, 
  Archive, Loader2, Calendar, AlertCircle, ChevronDown, ChevronUp, 
  ExternalLink, Info, Filter, FileSpreadsheet
} from 'lucide-react';
import { Worker, MonthlyPayroll, OrgSettings } from '../types/index';
import { statutoryExportService, FilingValidationReport, WorkerValidationIssue } from '../services/statutoryExportService';
import { useToast } from '../contexts/ToastContext';
import { triggerFrontlineHaptic } from '../utils/frontlineTouch';

// Import Web Worker for non-blocking ZIP compilation
import StatutoryExportWorker from '../workers/statutoryExportWorker?worker';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workers: Worker[];
  payrolls: MonthlyPayroll[];
  orgSettings: OrgSettings;
  tenantName: string;
  currentMonthStr: string;
}

export const StatutoryExportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  workers,
  payrolls,
  orgSettings,
  tenantName,
  currentMonthStr
}) => {
  const { toast } = useToast();
  const workerRef = useRef<globalThis.Worker | null>(null);

  const [quarterKey, setQuarterKey] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>('Q3');
  const [fyStartYear, setFyStartYear] = useState<number>(2025);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr || new Date().toISOString().slice(0, 7));
  const [filterMode, setFilterMode] = useState<'ALL' | 'VALID_ONLY'>('ALL');

  const [validationReport, setValidationReport] = useState<FilingValidationReport | null>(null);
  const [showIssuesList, setShowIssuesList] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [exportStats, setExportStats] = useState<any>(null);

  // Initialize Web Worker
  useEffect(() => {
    workerRef.current = new StatutoryExportWorker();

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Run initial validation check
  useEffect(() => {
    if (isOpen && workers.length > 0) {
      const report = statutoryExportService.validateWorkersForFiling(workers, payrolls, 'QUARTERLY');
      setValidationReport(report);
      setExportStats(null);
      setIsExporting(false);
      setProgressPercent(0);
    }
  }, [isOpen, workers, payrolls, selectedMonth, quarterKey]);

  if (!isOpen) return null;

  const handleStartExport = () => {
    if (!workerRef.current) {
      toast.error('Export worker could not be initialized.');
      return;
    }

    if (workers.length === 0) {
      toast.warning('No workers found to export.');
      return;
    }

    triggerFrontlineHaptic('light');
    setIsExporting(true);
    setProgressPercent(10);
    setProgressText('Starting background worker...');
    setExportStats(null);

    const taskId = 'export_' + Date.now();

    const handleWorkerMessage = (e: MessageEvent) => {
      if (e.data.id === taskId) {
        if (e.data.progress) {
          setProgressPercent(e.data.progress);
          if (e.data.statusText) setProgressText(e.data.statusText);
        }

        if (e.data.success) {
          workerRef.current?.removeEventListener('message', handleWorkerMessage);
          setIsExporting(false);
          setProgressPercent(100);
          setProgressText('Export completed!');

          const { zipBuffer, fileName, stats } = e.data.result;
          setExportStats(stats);

          // Trigger download in browser
          const blob = new Blob([zipBuffer], { type: 'application/zip' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          link.click();
          URL.revokeObjectURL(url);

          triggerFrontlineHaptic('confirm');
          toast.success(`Filing Pack downloaded successfully (${stats.form16Count} Form 16s, ECR, Form 24Q).`);
        } else if (e.data.error) {
          workerRef.current?.removeEventListener('message', handleWorkerMessage);
          setIsExporting(false);
          triggerFrontlineHaptic('alert');
          toast.error(e.data.error || 'Failed to generate export pack.');
        }
      }
    };

    workerRef.current.addEventListener('message', handleWorkerMessage);

    workerRef.current.postMessage({
      id: taskId,
      action: 'GENERATE_ZIP_PACK',
      payload: {
        workers,
        payrolls,
        orgSettings,
        quarterKey,
        fyStartYear,
        selectedMonth,
        tenantName,
        options: {
          validOnly: filterMode === 'VALID_ONLY'
        }
      }
    });
  };

  const quarterInfo = statutoryExportService.getQuarterInfo(quarterKey, fyStartYear);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Archive size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 tracking-tight">Statutory Filing Export Pack</h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                  EPFO • TRACES • FORM 16
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Government portal-ready artifacts bundled into a single audited ZIP archive
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-slate-800">

          {/* Filing Period & Scope Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1.5">
                <Calendar size={13} />
                EPFO ECR Month
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                disabled={isExporting}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-mono font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1.5">
                <FileSpreadsheet size={13} />
                Form 24Q Quarter
              </label>
              <select
                value={quarterKey}
                onChange={(e) => setQuarterKey(e.target.value as any)}
                disabled={isExporting}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Q1">Q1: Apr - Jun ({fyStartYear})</option>
                <option value="Q2">Q2: Jul - Sep ({fyStartYear})</option>
                <option value="Q3">Q3: Oct - Dec ({fyStartYear})</option>
                <option value="Q4">Q4: Jan - Mar ({fyStartYear + 1})</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1.5">
                <Filter size={13} />
                Export Filter Scope
              </label>
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as any)}
                disabled={isExporting}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Enrolled Workers</option>
                <option value="VALID_ONLY">Valid Records Only (Skip Errors)</option>
              </select>
            </div>
          </div>

          {/* Pre-Export Validation Audit Card */}
          {validationReport && (
            <div className={`p-4 rounded-2xl border transition-all ${
              validationReport.isFilingReady 
                ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950' 
                : 'bg-amber-50/70 border-amber-200 text-amber-950'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {validationReport.isFilingReady ? (
                      <CheckCircle2 size={20} className="text-emerald-600" />
                    ) : (
                      <AlertTriangle size={20} className="text-amber-600" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-black tracking-tight">
                      {validationReport.isFilingReady 
                        ? '100% Pre-Export Audit Passed' 
                        : 'Pre-Export Validation Findings'}
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {validationReport.readyCount} of {validationReport.totalWorkers} workers have fully compliant PAN, UAN, and employment dates.
                    </p>
                  </div>
                </div>

                {validationReport.issues.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowIssuesList(!showIssuesList)}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 flex items-center gap-1 transition-colors shrink-0"
                  >
                    <span>{showIssuesList ? 'Hide Issues' : `View ${validationReport.issues.length} Issues`}</span>
                    {showIssuesList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
              </div>

              {/* Collapsible Issue List */}
              {showIssuesList && validationReport.issues.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2 max-h-48 overflow-y-auto">
                  {validationReport.issues.map((issue, idx) => (
                    <div 
                      key={idx} 
                      className={`p-2.5 rounded-xl text-xs flex items-start gap-2.5 ${
                        issue.severity === 'ERROR' 
                          ? 'bg-rose-100/70 border border-rose-300 text-rose-950' 
                          : 'bg-amber-100/70 border border-amber-300 text-amber-950'
                      }`}
                    >
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase shrink-0 ${
                        issue.severity === 'ERROR' ? 'bg-rose-700 text-white' : 'bg-amber-700 text-white'
                      }`}>
                        {issue.severity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold flex items-center justify-between">
                          <span>{issue.workerName}</span>
                          <span className="text-[10px] font-mono opacity-70">Field: {issue.field}</span>
                        </div>
                        <p className="text-[11px] mt-0.5 leading-snug">{issue.message}</p>
                        <div className="text-[10px] font-semibold mt-1 opacity-80">
                          Affects: {issue.affectedFilings.join(', ')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Included Artifacts Grid */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Prescribed Statutory Artifacts in Download Pack
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              
              {/* Artifact 1: EPFO ECR */}
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <FileText size={17} />
                </div>
                <div>
                  <div className="font-bold text-slate-900">1. EPFO ECR 2.0 Text File</div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Official 11-column <code className="font-mono text-blue-700 font-bold">#~#</code> delimited format with zero-deduction and NCP days compliance for unifiedportal-emp.epfindia.gov.in.
                  </p>
                </div>
              </div>

              {/* Artifact 2: Form 24Q */}
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <FileSpreadsheet size={17} />
                </div>
                <div>
                  <div className="font-bold text-slate-900">2. Form 24Q TDS Return</div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    NSDL FVU text return with mid-quarter exit tracking and accompanying audit CSV for CA review.
                  </p>
                </div>
              </div>

              {/* Artifact 3: Form 16 Part A & B */}
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <ShieldCheck size={17} />
                </div>
                <div>
                  <div className="font-bold text-slate-900">3. Form 16 Part A &amp; Part B</div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Individual printable certificates per employee with Section 16(ia) standard deduction and Chapter VI-A itemization.
                  </p>
                </div>
              </div>

              {/* Artifact 4: Audit Report */}
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                  <Info size={17} />
                </div>
                <div>
                  <div className="font-bold text-slate-900">4. Audit Validation Report</div>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Full verification summary logging completeness checks, missing PAN notices, and portal upload guidance.
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* Web Worker Progress Bar */}
          {isExporting && (
            <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-blue-600" />
                  {progressText}
                </span>
                <span className="font-mono">{progressPercent}%</span>
              </div>
              <div className="w-full bg-blue-200/80 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-blue-700/80 font-medium">
                Generating in background Web Worker to preserve 60 FPS UI responsiveness...
              </p>
            </div>
          )}

          {/* Post-Export Stats Banner */}
          {exportStats && (
            <div className="p-3.5 rounded-2xl border border-emerald-300 bg-emerald-50 text-xs text-emerald-950 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                <span>
                  Pack compiled: <strong>{exportStats.form16Count} Form 16s</strong>, <strong>{exportStats.ecrRecordCount} ECR rows</strong>, <strong>{exportStats.deducteeCount} TDS deductees</strong>.
                </span>
              </div>
              <span className="font-mono font-bold text-emerald-800 shrink-0">ZIP Ready</span>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            Filing Cycle: <span className="font-bold text-slate-700">{quarterInfo.quarter} ({quarterInfo.financialYear})</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Close
            </button>

            <button
              type="button"
              onClick={handleStartExport}
              disabled={isExporting}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-black shadow-md shadow-blue-500/25 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isExporting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Packaging (.ZIP)...</span>
                </>
              ) : (
                <>
                  <Download size={15} />
                  <span>Generate Filing Pack (.ZIP)</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
