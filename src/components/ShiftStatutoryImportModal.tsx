import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Loader2,
  Lock,
  MapPin,
  Moon,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { OrgSettings, ShiftConfig } from '../types/index';
import { INDIAN_STATES, IndianStateName } from '../services/statutoryEngine';
import {
  SHIFT_RULES_TEMPLATE_FILENAME,
  downloadShiftRulesTemplate,
} from '../utils/workerExcelTemplate';
import {
  SHIFT_RULES_REQUIRED_HEADERS,
  ShiftOverlapPair,
  ShiftRulesValidationResult,
  applyShiftAndStatutoryMapping,
  createDemoShiftRulesExcelFile,
  formatShiftDisplayLabel,
  getStateStatutoryBundle,
  parseAndValidateShiftRulesFile,
} from '../utils/shiftStatutoryImportEngine';
import { useToast } from '../contexts/ToastContext';

interface ShiftStatutoryImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  orgSettings: OrgSettings;
  actorEmail: string;
  initialStep?: 'SHIFTS' | 'STATUTORY';
  onApplied: (updatedSettings: OrgSettings) => void;
}

type WizardStep = 'SHIFTS' | 'STATUTORY' | 'COMPLETE';

export const ShiftStatutoryImportModal: React.FC<ShiftStatutoryImportModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  orgSettings,
  actorEmail,
  initialStep = 'SHIFTS',
  onApplied,
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultState = (orgSettings.compliance?.statutoryMapping?.primaryState ||
    orgSettings.branches?.[0]?.state ||
    'Gujarat') as IndianStateName;

  const [step, setStep] = useState<WizardStep>(initialStep);
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [shiftValidation, setShiftValidation] = useState<ShiftRulesValidationResult | null>(null);
  const [mergeMode, setMergeMode] = useState<'MERGE' | 'REPLACE'>('MERGE');
  const [selectedState, setSelectedState] = useState<IndianStateName>(
    INDIAN_STATES.includes(defaultState) ? defaultState : 'Gujarat'
  );
  const [applyError, setApplyError] = useState<string | null>(null);

  const [completionSummary, setCompletionSummary] = useState<{
    createdShifts: ShiftConfig[];
    overlappingPairs: ShiftOverlapPair[];
    primaryState: IndianStateName;
    ptSummary: string;
    lwfScheduleLabel: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep(initialStep);
      const resolved = (orgSettings.compliance?.statutoryMapping?.primaryState ||
        orgSettings.branches?.[0]?.state ||
        'Gujarat') as IndianStateName;
      setSelectedState(INDIAN_STATES.includes(resolved) ? resolved : 'Gujarat');
      setApplyError(null);
    }
  }, [isOpen, initialStep, orgSettings]);

  const statutoryBundle = useMemo(() => getStateStatutoryBundle(selectedState), [selectedState]);

  if (!isOpen) return null;

  const resetModal = () => {
    setStep(initialStep);
    setShiftValidation(null);
    setMergeMode('MERGE');
    setApplyError(null);
    setCompletionSummary(null);
    setParsing(false);
    setSaving(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (saving) return;
    resetModal();
    onClose();
  };

  const handleDownloadTemplate = () => {
    try {
      const fileName = downloadShiftRulesTemplate();
      toast.success(`Downloaded ${fileName} with sample shifts and 24-hour HH:MM guide.`);
    } catch (err) {
      console.error('Shift template download failed:', err);
      toast.error('Unable to generate Shift_Rules_Template.xlsx.');
    }
  };

  const processFile = async (file: File) => {
    setParsing(true);
    setApplyError(null);
    try {
      const result = await parseAndValidateShiftRulesFile({
        file,
        existingShifts: mergeMode === 'MERGE' ? orgSettings.shifts || [] : [],
      });
      setShiftValidation(result);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to parse shift rules file.');
    } finally {
      setParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleProceedToStatutory = () => {
    if (shiftValidation && (!shiftValidation.ok || !shiftValidation.canCommit)) {
      toast.error('Please resolve the shift file format errors before continuing, or clear the file.');
      return;
    }
    setStep('STATUTORY');
  };

  const handleApplyAndLock = async () => {
    setSaving(true);
    setApplyError(null);
    try {
      const shiftsToImport =
        shiftValidation?.ok && shiftValidation.canCommit ? shiftValidation.validShifts : [];

      const { updatedSettings, overlappingPairs, statutoryBundle: appliedBundle } =
        await applyShiftAndStatutoryMapping({
          tenantId,
          currentSettings: orgSettings,
          importedShifts: shiftsToImport,
          mergeMode,
          primaryState: selectedState,
          actorEmail,
        });

      setCompletionSummary({
        createdShifts: shiftsToImport.length > 0 ? shiftsToImport : updatedSettings.shifts,
        overlappingPairs,
        primaryState: appliedBundle.state,
        ptSummary: appliedBundle.ptSummary,
        lwfScheduleLabel: appliedBundle.lwfDatesSummary,
      });
      setStep('COMPLETE');
      onApplied(updatedSettings);

      toast.success(
        shiftsToImport.length > 0
          ? `Created ${shiftsToImport.length} shift rule${
              shiftsToImport.length === 1 ? '' : 's'
            } and locked ${appliedBundle.state} statutory settings.`
          : `Auto-applied and locked ${appliedBundle.state} PT, LWF, and Central PF/ESI settings.`
      );
    } catch (err: any) {
      const msg = err?.message || 'Failed to save shifts and lock statutory settings.';
      setApplyError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const canProceedStep1 = !shiftValidation || (shiftValidation.ok && shiftValidation.canCommit);
  const importedShiftCount =
    shiftValidation?.ok && shiftValidation.canCommit ? shiftValidation.validShifts.length : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* HEADER */}
        <div className="px-5 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0">
              <Clock size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold tracking-tight truncate">
                Shift Rules Import &amp; State Statutory Mapping
              </h2>
              <p className="text-xs text-slate-300 truncate">
                Import factory shifts via {SHIFT_RULES_TEMPLATE_FILENAME} and lock verified state PT,
                LWF &amp; Central PF/ESI rules
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            aria-label="Close shift and statutory wizard"
            className="p-2 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* STEPPER */}
        <div className="px-5 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap text-xs shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 font-semibold">
            <span
              className={`inline-flex items-center gap-1.5 ${
                step === 'SHIFTS' ? 'text-indigo-700' : 'text-emerald-700'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  step === 'SHIFTS' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'
                }`}
              >
                1
              </span>
              Upload Shift Rules
            </span>
            <span className="text-slate-300">→</span>
            <span
              className={`inline-flex items-center gap-1.5 ${
                step === 'STATUTORY'
                  ? 'text-indigo-700'
                  : step === 'COMPLETE'
                  ? 'text-emerald-700'
                  : 'text-slate-400'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  step === 'STATUTORY'
                    ? 'bg-indigo-600 text-white'
                    : step === 'COMPLETE'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                2
              </span>
              Select Primary State &amp; Lock
            </span>
            <span className="text-slate-300">→</span>
            <span
              className={`inline-flex items-center gap-1.5 ${
                step === 'COMPLETE' ? 'text-emerald-700' : 'text-slate-400'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  step === 'COMPLETE'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                3
              </span>
              Ready for Day-1 Payroll
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <Lock size={13} className="text-indigo-600" />
            <span>Statutory slabs locked via state selector (no Excel upload)</span>
          </div>
        </div>

        {/* BODY */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* STEP 1: SHIFT RULES UPLOAD */}
          {step === 'SHIFTS' && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-7 bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <FileSpreadsheet size={16} className="text-indigo-600" />
                      <span>Download {SHIFT_RULES_TEMPLATE_FILENAME}</span>
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">
                      Enter your factory&apos;s shift timings using strict 24-hour{' '}
                      <span className="font-mono font-bold text-slate-800">HH:MM</span> format (e.g.,{' '}
                      <span className="font-mono">06:00</span> to{' '}
                      <span className="font-mono">14:00</span>). Overnight shifts like{' '}
                      <span className="font-mono">22:00</span> to{' '}
                      <span className="font-mono">06:00</span> are automatically recognized.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      <Download size={14} />
                      <span>Download {SHIFT_RULES_TEMPLATE_FILENAME}</span>
                    </button>
                  </div>

                  <div className="text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-700">Required Columns:</span>{' '}
                    {SHIFT_RULES_REQUIRED_HEADERS.join(' · ')}
                  </div>
                </div>

                <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-800 block">
                      Import Merge Mode
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                      <button
                        type="button"
                        onClick={() => setMergeMode('MERGE')}
                        className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                          mergeMode === 'MERGE'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Add / Update
                      </button>
                      <button
                        type="button"
                        onClick={() => setMergeMode('REPLACE')}
                        className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                          mergeMode === 'REPLACE'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Replace Custom
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => processFile(createDemoShiftRulesExcelFile('FACTORY_SAMPLE'))}
                      disabled={parsing}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Sparkles size={13} className="text-indigo-600" />
                      <span>Load Sample Factory Shifts</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        processFile(createDemoShiftRulesExcelFile('INVALID_TIME_SAMPLE'))
                      }
                      disabled={parsing}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      <AlertTriangle size={12} />
                      <span>Test Invalid Time (&ldquo;9 to 5&rdquo;)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* DROPZONE */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => !parsing && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50/70'
                    : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50/70'
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
                    <Loader2 size={24} className="text-indigo-600 animate-spin" />
                    <p className="text-xs font-bold text-slate-800">
                      Validating shift timings &amp; checking overlaps...
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                      <Upload size={20} />
                    </div>
                    <p className="text-sm font-bold text-slate-900">
                      Drop your filled {SHIFT_RULES_TEMPLATE_FILENAME} here, or click to browse
                    </p>
                    <p className="text-xs text-slate-500">
                      Accepts .xlsx, .xls, .csv · Strict 24-hour HH:MM time validation
                    </p>
                  </div>
                )}
              </div>

              {/* FATAL ERROR BANNER */}
              {shiftValidation && !shiftValidation.ok && (
                <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 text-xs">
                    <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-rose-900">{shiftValidation.fatalError}</p>
                      {shiftValidation.fatalDetail && (
                        <p className="text-rose-700 mt-1">{shiftValidation.fatalDetail}</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShiftValidation(null)}
                    className="text-xs font-bold text-rose-700 hover:text-rose-900 shrink-0 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* VALIDATION PREVIEW */}
              {shiftValidation && shiftValidation.ok && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <FileSpreadsheet size={15} className="text-indigo-600" />
                      <span>{shiftValidation.fileName}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        {shiftValidation.validCount} valid
                      </span>
                      {shiftValidation.errorCount > 0 && (
                        <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                          {shiftValidation.errorCount} format error
                          {shiftValidation.errorCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShiftValidation(null)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Clear file
                    </button>
                  </div>

                  {/* Format Errors Callout */}
                  {shiftValidation.blockReason && (
                    <div className="bg-rose-50 border border-rose-300 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-rose-900">
                      <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Import Blocked:</span>{' '}
                        {shiftValidation.blockReason}
                      </div>
                    </div>
                  )}

                  {/* Overlapping Shifts Warning (Non-blocking — Allowed!) */}
                  {shiftValidation.overlappingPairs.length > 0 && (
                    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 space-y-1.5 text-xs text-amber-950">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                        <span>
                          Overlapping Shifts Detected ({shiftValidation.overlappingPairs.length}{' '}
                          pair{shiftValidation.overlappingPairs.length === 1 ? '' : 's'}) — Allowed
                          with Worker-Assignment Warning
                        </span>
                      </div>
                      <ul className="list-disc pl-5 space-y-0.5 text-amber-900">
                        {shiftValidation.overlappingPairs.map((pair, idx) => (
                          <li key={idx}>{pair.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Shift Rows Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto max-h-[260px]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 border-b border-slate-200 sticky top-0">
                          <tr>
                            <th className="py-2 px-3">Row</th>
                            <th className="py-2 px-3">Shift Record Preview</th>
                            <th className="py-2 px-3">Timing (24h)</th>
                            <th className="py-2 px-3 text-center">Grace</th>
                            <th className="py-2 px-3 text-center">Half-Day</th>
                            <th className="py-2 px-3">Validation Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {shiftValidation.allRows.map((row) => (
                            <tr
                              key={row.rowNumber}
                              className={
                                row.status === 'ERROR'
                                  ? 'bg-rose-50/70'
                                  : row.status === 'VALID_WITH_OVERLAP'
                                  ? 'bg-amber-50/50'
                                  : ''
                              }
                            >
                              <td className="py-2 px-3 font-mono text-slate-500">
                                #{row.rowNumber}
                              </td>
                              <td className="py-2 px-3">
                                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                  <span>{row.displayLabel}</span>
                                  {row.isOvernight && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                                      <Moon size={10} /> Overnight
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-700">
                                {row.startTime || String(row.rawRow['Start Time'] || '—')} –{' '}
                                {row.endTime || String(row.rawRow['End Time'] || '—')}
                                {row.durationHours !== null && (
                                  <span className="text-slate-400 ml-1">
                                    ({row.durationHours}h)
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-center font-mono text-slate-700">
                                {row.gracePeriodMins !== null ? `${row.gracePeriodMins}m` : '—'}
                              </td>
                              <td className="py-2 px-3 text-center font-mono text-slate-700">
                                {row.halfDayHours !== null ? `${row.halfDayHours}h` : '—'}
                              </td>
                              <td className="py-2 px-3 max-w-[260px]">
                                {row.status === 'ERROR' ? (
                                  <div className="text-rose-700 font-semibold space-y-0.5">
                                    {row.errors.map((err, i) => (
                                      <div key={i}>{err}</div>
                                    ))}
                                  </div>
                                ) : row.status === 'VALID_WITH_OVERLAP' ? (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex px-2 py-0.5 rounded bg-amber-200 text-amber-950 text-[10px] font-bold uppercase">
                                      Allowed · Overlapping
                                    </span>
                                    <div className="text-[11px] text-amber-900">
                                      Overlaps: {row.overlapsWith.join(', ')}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="inline-flex px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                                    Ready
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
            </>
          )}

          {/* STEP 2: PRIMARY STATE STATUTORY MAPPING (STRICT DROPDOWN ONLY) */}
          {step === 'STATUTORY' && (
            <>
              {/* Anti-Excel Compliance Guard Notice */}
              <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-start gap-3">
                <ShieldAlert size={19} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-bold text-white">
                    Verified Statutory Selector Only — Excel Upload Disabled for Tax/PF Slabs
                  </p>
                  <p className="text-slate-300 leading-relaxed">
                    To prevent payroll compliance errors, Professional Tax (PT) slabs, Labour
                    Welfare Fund (LWF) schedules, and Central EPF/ESIC rules cannot be uploaded via
                    Excel. Select your factory&apos;s Primary State below to auto-apply and lock
                    official statutory settings.
                  </p>
                </div>
              </div>

              {/* Strict Primary State Dropdown */}
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 sm:p-5 space-y-2.5">
                <label
                  htmlFor="primary-statutory-state-select"
                  className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 flex items-center gap-1.5"
                >
                  <MapPin size={15} className="text-indigo-600" />
                  <span>Primary Factory State (Statutory Jurisdiction) *</span>
                </label>
                <select
                  id="primary-statutory-state-select"
                  value={selectedState}
                  onChange={(e) => setSelectedState(e.target.value as IndianStateName)}
                  className="w-full px-4 py-3 bg-white border-2 border-indigo-300 focus:border-indigo-600 rounded-xl text-sm font-bold text-slate-900 outline-none shadow-2xs cursor-pointer"
                >
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-indigo-800">
                  Selecting <span className="font-bold">{selectedState}</span> immediately locks{' '}
                  {selectedState} PT slabs, {selectedState} LWF deduction dates, and Central EPF &amp;
                  ESIC rules across your payroll engine.
                </p>
              </div>

              {/* Auto-Applied Statutory Rules Preview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {/* 1. State PT Slabs */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Scale size={14} className="text-indigo-600" />
                      <span>{statutoryBundle.state} PT Slabs</span>
                    </h4>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        statutoryBundle.ptApplicable
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {statutoryBundle.ptApplicable ? 'Auto-Applied' : 'Nil State'}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {statutoryBundle.ptSlabs.map((slab, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-50 border border-slate-100 rounded-xl px-2.5 py-2 text-[11px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-600">{slab.salaryRange}</span>
                          <span className="font-mono font-bold text-slate-900 shrink-0">
                            {slab.monthlyTax}
                          </span>
                        </div>
                        {slab.note && (
                          <div className="text-[10px] text-indigo-700 mt-0.5">{slab.note}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. State LWF Dates & Rates */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Calendar size={14} className="text-amber-600" />
                      <span>{statutoryBundle.state} LWF Dates</span>
                    </h4>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        statutoryBundle.lwfRule.enabled
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {statutoryBundle.lwfRule.frequencyLabel}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-800 leading-snug">
                    {statutoryBundle.lwfDatesSummary}
                  </p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {statutoryBundle.lwfRule.statutoryNote}
                  </p>
                </div>

                {/* 3. Central PF & ESI Rules */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-emerald-600" />
                      <span>Central PF / ESI Rules</span>
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-emerald-100 text-emerald-800">
                      Central Act
                    </span>
                  </div>
                  <div className="space-y-2 text-[11px]">
                    <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-2.5 text-slate-700">
                      <div className="font-bold text-emerald-950">EPF &amp; EPS</div>
                      <div className="mt-0.5">{statutoryBundle.centralPfRules.summary}</div>
                    </div>
                    <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-2.5 text-slate-700">
                      <div className="font-bold text-blue-950">ESIC</div>
                      <div className="mt-0.5">{statutoryBundle.centralEsiRules.summary}</div>
                    </div>
                  </div>
                </div>
              </div>

              {applyError && (
                <div className="bg-rose-50 border border-rose-300 rounded-2xl p-3.5 text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                  <span>{applyError}</span>
                </div>
              )}
            </>
          )}

          {/* STEP 3: COMPLETE */}
          {step === 'COMPLETE' && completionSummary && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-3.5">
                <CheckCircle2 size={24} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <h3 className="text-base font-extrabold text-emerald-950">
                    Shift Rules Created &amp; {completionSummary.primaryState} Statutory Settings
                    Locked
                  </h3>
                  <p className="text-xs text-emerald-800">
                    Overtime, half-day thresholds, {completionSummary.primaryState} PT slabs, LWF
                    deduction dates, and Central EPF/ESIC rules are now active from day one.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Active Shift Records ({completionSummary.createdShifts.length})
                  </h4>
                  <ul className="space-y-1.5 text-xs">
                    {completionSummary.createdShifts.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100"
                      >
                        <span className="font-bold text-slate-900">
                          {formatShiftDisplayLabel(s.name, s.startTime, s.endTime)}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">
                          Grace {s.gracePeriodMins}m · Half {s.minHalfDayHours}h
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                      Locked Statutory Mapping
                    </h4>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold uppercase">
                      <Lock size={10} /> Locked
                    </span>
                  </div>
                  <div className="text-sm font-extrabold text-slate-900">
                    Primary State: {completionSummary.primaryState}
                  </div>
                  <p className="text-xs text-slate-700">{completionSummary.ptSummary}</p>
                  <p className="text-xs text-slate-700">{completionSummary.lwfScheduleLabel}</p>
                  <p className="text-xs text-emerald-700 font-semibold">
                    Central EPF (12% / ₹15,000 cap + 50% Rule) &amp; ESIC (0.75% / ₹21,000 cap)
                    Active
                  </p>
                </div>
              </div>

              {completionSummary.overlappingPairs.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Overlapping Shifts Reminder:</span>{' '}
                    {completionSummary.overlappingPairs.length} overlapping shift pair
                    {completionSummary.overlappingPairs.length === 1 ? ' exists' : 's exist'}.
                    WorkforcePro will warn you whenever a worker is assigned across overlapping
                    shifts.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 flex-wrap shrink-0">
          {step === 'SHIFTS' && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleProceedToStatutory}
                disabled={!canProceedStep1}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                <span>
                  {importedShiftCount > 0
                    ? `Next: Select Primary State (${importedShiftCount} Shift${
                        importedShiftCount === 1 ? '' : 's'
                      } Ready)`
                    : 'Skip Shift Upload → Select Primary State'}
                </span>
                <ArrowRight size={14} />
              </button>
            </>
          )}

          {step === 'STATUTORY' && (
            <>
              <button
                type="button"
                onClick={() => setStep('SHIFTS')}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
              >
                <ArrowLeft size={14} />
                <span>Back to Shift Rules</span>
              </button>

              <button
                type="button"
                onClick={handleApplyAndLock}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Saving &amp; Locking Statutory Rules...</span>
                  </>
                ) : (
                  <>
                    <Lock size={14} />
                    <span>
                      {importedShiftCount > 0
                        ? `Create ${importedShiftCount} Shift${
                            importedShiftCount === 1 ? '' : 's'
                          } & Lock ${selectedState} Rules`
                        : `Auto-Apply & Lock ${selectedState} Statutory Rules`}
                    </span>
                  </>
                )}
              </button>
            </>
          )}

          {step === 'COMPLETE' && (
            <>
              <button
                type="button"
                onClick={resetModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <Upload size={14} />
                <span>Import More Shifts</span>
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
