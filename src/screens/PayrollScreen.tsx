import { conflictService } from '../services/conflictService';
import { PunchConflict } from '../types/index';
import { ConflictResolutionModal } from '../components/ConflictResolutionModal';
import { ShieldAlert, GitMerge, AlertCircle, Sparkles, Calculator, Shield, FileCheck, Building2, Archive } from 'lucide-react';
import React, { useState, useMemo, useEffect } from 'react';
import { IndianRupee, FileText, Download, CheckCircle, Clock, AlertTriangle, ChevronRight, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import { wageService } from '../services/wageService';
import { statutoryEngine } from '../services/statutoryEngine';
import { MonthlyPayroll, Worker, AttendanceRecord, Advance, OrgSettings } from '../types/index';
import { Payslip } from '../components/Payslip';
import { StatutoryTraceModal } from '../components/StatutoryTraceModal';
import { TaxDeclarationModal } from '../components/TaxDeclarationModal';
import { Form16Modal } from '../components/Form16Modal';
import { StatutoryExportModal } from '../components/StatutoryExportModal';

export const PayrollScreen: React.FC = () => {
  const { profile, limits } = useAuth();
  const { toast } = useToast();
  const [selectedPayroll, setSelectedPayroll] = useState<MonthlyPayroll | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  
  const [savedPayrolls, setSavedPayrolls] = useState<MonthlyPayroll[]>([]); 
  const [siteAddress, setSiteAddress] = useState<string>(''); 
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [unresolvedConflicts, setUnresolvedConflicts] = useState<PunchConflict[]>([]);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false); 

  // Statutory Compliance Modals State
  const [tracePayroll, setTracePayroll] = useState<MonthlyPayroll | null>(null);
  const [taxDeclarationWorker, setTaxDeclarationWorker] = useState<Worker | null>(null);
  const [form16Worker, setForm16Worker] = useState<Worker | null>(null);
  const [isExportPackOpen, setIsExportPackOpen] = useState(false);

  const loadData = async () => {
    const tenantId = profile?.tenantId;
    if (!tenantId) return;
    
    try {
      setFetchError(null);
      const fetchedWorkers = await dbService.getWorkers(tenantId);
      const fetchedAttendance = await dbService.getAttendanceHistory(tenantId);
      const fetchedAdvances = await dbService.getAdvances(tenantId);
      const fetchedSettings = await dbService.getOrgSettings(tenantId);
      
      let fetchedPayrolls: MonthlyPayroll[] = [];
      try {
         fetchedPayrolls = await dbService.getPayrollsByMonth(tenantId, currentMonthStr);
      } catch (payrollErr) {
         console.warn("Could not load saved payrolls.", payrollErr);
      }

      setWorkers(fetchedWorkers);
      setAdvances(fetchedAdvances);
      setSettings(fetchedSettings);
      setSiteAddress(fetchedSettings?.baseLocation?.address || '');
      setSavedPayrolls(fetchedPayrolls);
      setAttendanceHistory(fetchedAttendance);
      const conflicts = await conflictService.getUnresolvedPayrollConflicts(tenantId, currentMonthStr);
      setUnresolvedConflicts(conflicts);
    } catch (err: any) {
      console.error("Failed to load payroll data", err);
      setFetchError(err.message || "Failed to load database records");
      toast.error("Could not load monthly payroll data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [profile, currentMonthStr]);

  const handleDownloadECR = () => {
    if (payrolls.length === 0) {
      toast.warning('No payroll records found for this period.');
      return;
    }
    const ecrContent = statutoryEngine.generateECRFileContent(payrolls, workers);
    if (!ecrContent || !ecrContent.trim()) {
      toast.warning('No workers with 12-digit EPFO UAN found. Please ensure workers have UAN in directory.');
      return;
    }
    const blob = new Blob([ecrContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `EPFO_ECR_2.0_${currentMonthStr.replace('-', '')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Official EPFO ECR 2.0 text file downloaded for ${currentMonthStr}`);
  };

  // Re-check blocking conflicts when resolution events fire
  useEffect(() => {
    const handleConflictsChanged = () => {
      if (profile?.tenantId) {
        conflictService.getUnresolvedPayrollConflicts(profile.tenantId, currentMonthStr).then(setUnresolvedConflicts);
      }
    };
    window.addEventListener('punchConflictsChanged', handleConflictsChanged);
    return () => window.removeEventListener('punchConflictsChanged', handleConflictsChanged);
  }, [profile?.tenantId, currentMonthStr]);

  const payrolls = useMemo(() => {
    if (!profile?.tenantId || workers.length === 0) return [];
    
    return workers.map(worker => {
      const alreadySaved = savedPayrolls.find(p => p.workerId === worker.id);
      // Only preserve historical snapshots if officially marked PAID or LOCKED with valid wages
      if (alreadySaved && (alreadySaved.status === 'PAID' || alreadySaved.status === 'LOCKED') && alreadySaved.earnings?.gross > 0) {
        return alreadySaved;
      }

      return wageService.calculateMonthlyPayroll(
        worker,
        currentMonthStr,
        attendanceHistory,
        advances,
        settings || { shifts: [], enableBreakTracking: false }
      );
    });
  }, [workers, currentMonthStr, attendanceHistory, advances, settings, savedPayrolls, profile]);

  const handleMarkAsPaid = async (payroll: MonthlyPayroll, e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (!profile?.tenantId) return;

    const updated = { ...payroll, status: 'PAID' as const, paymentDate: new Date().toISOString() };
    
    setSavedPayrolls(prev => {
      const index = prev.findIndex(p => p.workerId === payroll.workerId);
      if (index >= 0) {
        const copy = [...prev];
        copy[index] = updated;
        return copy;
      }
      return [...prev, updated];
    });

    try {
      await dbService.saveMonthlyPayroll(updated);
      toast.success(`Marked ₹${payroll.netPayable.toLocaleString()} as paid for ${payroll.workerName}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save payout status. Check Firestore permissions.");
    }
  };

  const pendingPayout = payrolls.filter(p => p.status !== 'PAID').reduce((acc, p) => acc + p.netPayable, 0);
  const paidPayout = payrolls.filter(p => p.status === 'PAID').reduce((acc, p) => acc + p.netPayable, 0);
  const totalGross = payrolls.reduce((acc, p) => acc + p.earnings.gross, 0);
  const totalEmployerStatutory = payrolls.reduce((acc, p) => acc + (p.statutory?.totalEmployerStatutory || 0), 0);
  const totalCTC = payrolls.reduce((acc, p) => acc + (p.employerCostToCompany || (p.earnings.gross + (p.statutory?.totalEmployerStatutory || 0))), 0);
  const totalStaffCount = workers.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      
      {/* TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Monthly Payroll & Statutory Compliance</h1>
          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
            <span>Automated PF (12%), ESI (0.75%), State PT (all 28 states) & TDS</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-600 font-semibold">
              {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          <button
            onClick={() => setIsExportPackOpen(true)}
            className="h-10 px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Export complete filing pack (.ZIP): EPFO ECR, Form 24Q quarterly return, Form 16 Part A/B certificates"
          >
            <Archive size={15} />
            <span>Export Filing Pack (.ZIP)</span>
          </button>

          <button
            onClick={handleDownloadECR}
            className="h-10 px-3.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download official EPFO ECR 2.0 file (#~# delimited format) for unified portal upload"
          >
            <Download size={15} className="text-blue-600" />
            <span>EPFO ECR (.txt)</span>
          </button>
          
          <div className="text-xs text-slate-500 font-mono tabular-nums bg-white border border-slate-200/80 px-3 py-2 rounded-xl shadow-xs">
            Staff Ledger: <strong className="text-slate-900">{totalStaffCount} Operators</strong>
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="bg-rose-50/70 border border-rose-200 p-4 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={18} />
          <div>
            <h3 className="text-rose-900 font-bold text-xs">Payroll Synchronization Warning</h3>
            <p className="text-rose-700 text-xs mt-0.5">{fetchError}</p>
          </div>
        </div>
      )}

      {/* BLOCKING VALIDATION BANNER FOR PAYROLL FINALISATION CONFLICTS */}
      {unresolvedConflicts.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-3xl p-5 sm:p-6 shadow-sm animate-in fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md">
                <ShieldAlert size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-black text-rose-950">
                    Payroll Finalisation Blocked
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-200 text-rose-900 font-mono font-black text-xs border border-rose-300 animate-pulse">
                    {unresolvedConflicts.length} Attendance Conflict(s)
                  </span>
                </div>
                <p className="text-xs text-rose-900 mt-1 leading-relaxed max-w-xl">
                  Disbursement is locked for <strong>{new Date(currentMonthStr + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}</strong>. Labor regulations prohibit finalising payroll while conflicting offline and server attendance punches remain unreconciled.
                </p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-mono font-bold text-rose-800 uppercase">Affected Personnel:</span>
                  {unresolvedConflicts.map(c => (
                    <span key={c.id} className="px-2.5 py-1 rounded-xl bg-white border-2 border-rose-200 text-rose-900 text-xs font-bold shadow-xs">
                      {c.workerName}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsConflictModalOpen(true)}
              className="min-h-[56px] px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs sm:text-sm border-2 border-rose-400 shadow-md active:scale-95 flex items-center justify-center gap-2 transition-all shrink-0 cursor-pointer"
            >
              <GitMerge size={20} />
              <span>Review & Resolve ({unresolvedConflicts.length})</span>
            </button>
          </div>
        </div>
      )}

      {!fetchError && (
        <>
          {/* STATUTORY DEPTH PAYROLL KPIS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pending Net Pay</span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-amber-600 mt-1">
                ₹{pendingPayout.toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">To disburse to operators</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Settled Net Pay</span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-emerald-600 mt-1">
                ₹{paidPayout.toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Paid via bank transfer</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gross Wages</span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1">
                ₹{totalGross.toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Basic + OT + Allowances</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Employer Liabilities</span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-blue-600 mt-1">
                +₹{totalEmployerStatutory.toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">PF (13.0%) & ESI (3.25%)</p>
            </div>

            <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 shadow-xs sm:col-span-2 lg:col-span-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Company CTC</span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-emerald-400 mt-1">
                ₹{totalCTC.toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Gross + Employer Stat</p>
            </div>
          </div>

          {/* DUAL VIEWPORT PAYROLL ROSTER: 1 column mobile, 2 columns desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {payrolls.map(payroll => (
              <div 
                key={payroll.id} 
                className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden"
              >
                <div 
                  onClick={() => {
                    if (!limits?.payslipEnabled) {
                      toast.info("Generating Detailed Payslips is available on Pro & Enterprise plans.");
                      return;
                    }
                    setSelectedPayroll(payroll);
                  }}
                  className="p-5 cursor-pointer hover:bg-slate-50/50 transition-colors flex-1"
                >
                  {/* WORKER AND NET PAY */}
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-sm text-slate-700 shrink-0">
                        {payroll.workerName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-slate-900 truncate">{payroll.workerName}</h3>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono tabular-nums">{payroll.attendanceSummary.payableDays} Payable Days</span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="font-mono tabular-nums">{payroll.attendanceSummary.totalOvertimeHours}h OT</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-base sm:text-lg font-extrabold font-mono tabular-nums text-slate-900">
                        ₹{payroll.netPayable.toLocaleString()}
                      </div>
                      <div className="text-[11px] mt-0.5">
                        {payroll.status === 'PAID' ? (
                          <span className="text-emerald-700 font-semibold">· Disbursed</span>
                        ) : (
                          <span className="text-amber-700 font-semibold">· Unpaid</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ATTENDANCE & ADVANCES BREAKDOWN */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-mono tabular-nums">
                    <span>{payroll.attendanceSummary.presentDays} Present</span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span>{payroll.attendanceSummary.halfDays} Half</span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span>{payroll.attendanceSummary.absentDays} Absent</span>
                    {payroll.attendanceSummary.paidLeaves > 0 && (
                      <>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="text-blue-600">{payroll.attendanceSummary.paidLeaves} Leave</span>
                      </>
                    )}
                  </div>

                  {/* EARNINGS VS ADVANCE DEDUCTIONS */}
                  <div className="mt-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs font-mono tabular-nums">
                    <span className="text-slate-600">
                      Gross: <strong className="text-slate-900 font-bold">₹{payroll.earnings.gross.toLocaleString()}</strong>
                    </span>
                    <span className="text-rose-600">
                      Kharchi: <strong className="font-bold">-₹{payroll.deductions.advances.toLocaleString()}</strong>
                    </span>
                  </div>

                  {/* STATUTORY DEDUCTION PILLS & CTC LIABILITIES */}
                  {payroll.statutory && (
                    <div className="mt-2.5 p-2.5 bg-slate-50/70 rounded-xl border border-slate-200/90 space-y-1.5">
                      <div className="flex items-center justify-between flex-wrap gap-1 text-[11px]">
                        <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                          Statutory Deductions (EE)
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                            {payroll.statutory.state} PT
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                            {payroll.statutory.taxRegime} Regime
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 text-[11px] font-mono tabular-nums">
                        <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                          EPF: <strong>₹{payroll.statutory.employeePf}</strong>
                        </span>
                        {payroll.statutory.isEsiApplicable ? (
                          <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                            ESI: <strong>₹{payroll.statutory.employeeEsi}</strong>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-amber-800 font-semibold" title={payroll.statutory.esiDroppedNote}>
                            ESI: Exempt (&gt; ₹21k)
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                          PT: <strong>₹{payroll.statutory.professionalTax}</strong>
                        </span>
                        {payroll.statutory.tds > 0 ? (
                          <span className="px-2 py-0.5 rounded-md bg-violet-50 border border-violet-200 text-violet-800 font-bold">
                            TDS: ₹{payroll.statutory.tds}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-400">
                            TDS: ₹0
                          </span>
                        )}
                      </div>

                      <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                        <span>Employer Stat (PF+ESI): +₹{payroll.statutory.totalEmployerStatutory.toLocaleString()}</span>
                        <span className="font-bold text-slate-900">CTC: ₹{(payroll.employerCostToCompany || (payroll.earnings.gross + payroll.statutory.totalEmployerStatutory)).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* BOTTOM ACTION BUTTONS */}
                <div className="p-3 bg-slate-50/60 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => {
                        if (!limits?.payslipEnabled) {
                          toast.info("Generating Detailed Payslips is available on Pro & Enterprise plans.");
                          return;
                        }
                        setSelectedPayroll(payroll);
                      }}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-200/70 transition-colors"
                      title="View printable payslip"
                    >
                      <FileText size={14} className="text-slate-500" />
                      <span>Payslip</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTracePayroll(payroll);
                      }}
                      className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                      title="Show audited mathematical calculation derivation"
                    >
                      <Calculator size={13} />
                      <span>Show Calculation</span>
                    </button>

                    {(() => {
                      const workerObj = workers.find(w => w.id === payroll.workerId);
                      return (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTaxDeclarationWorker(workerObj || null);
                            }}
                            className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                            title="Configure state PT slabs, tax regime (Old vs New) & 80C declarations"
                          >
                            <Shield size={13} />
                            <span>Tax / State</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setForm16Worker(workerObj || null);
                            }}
                            className="text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-200/70 border border-slate-300 flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                            title="Generate official Form 16 Part B Certificate"
                          >
                            <FileCheck size={13} />
                            <span>Form 16</span>
                          </button>
                        </>
                      );
                    })()}
                  </div>

                  <div>
                    {(() => {
                      const workerConflict = unresolvedConflicts.find(c => c.workerId === payroll.workerId);
                      if (payroll.status === 'PAID') {
                        return (
                          <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1 px-2 py-1">
                            <CheckCircle size={13} />
                            <span>Settled</span>
                          </span>
                        );
                      }
                      if (workerConflict) {
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsConflictModalOpen(true);
                            }}
                            className="min-h-[38px] text-xs font-black text-rose-700 bg-rose-100 hover:bg-rose-200 border-2 border-rose-300 px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                            title="Click to resolve attendance conflict blocking this payroll"
                          >
                            <AlertCircle size={13} />
                            <span>Resolve Conflict</span>
                          </button>
                        );
                      }
                      return (
                        <button 
                          onClick={(e) => handleMarkAsPaid(payroll, e)}
                          className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                        >
                          Mark Paid
                        </button>
                      );
                    })()}
                  </div>
                </div>

              </div>
            ))}

            {payrolls.length === 0 && !loading && (
              <div className="col-span-full text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
                <IndianRupee className="mx-auto mb-2 text-slate-300" size={24} />
                <p className="text-sm font-semibold text-slate-700">No personnel records found for salary generation</p>
                <p className="text-xs text-slate-400 mt-1">Workers must be registered in the directory to compute payroll.</p>
              </div>
            )}
          </div>
        </>
      )}

      {selectedPayroll && (
        <Payslip 
          data={selectedPayroll} 
          companyName={profile?.companyName || 'Factory Admin'}
          siteAddress={siteAddress}
          onClose={() => setSelectedPayroll(null)} 
        />
      )}

      {/* STATUTORY CALCULATION TRACE MODAL */}
      <StatutoryTraceModal
        isOpen={Boolean(tracePayroll)}
        onClose={() => setTracePayroll(null)}
        payroll={tracePayroll}
      />

      {/* TAX DECLARATION & STATE PT CONFIGURATION MODAL */}
      <TaxDeclarationModal
        isOpen={Boolean(taxDeclarationWorker)}
        onClose={() => setTaxDeclarationWorker(null)}
        worker={taxDeclarationWorker}
        tenantId={profile?.tenantId || ''}
        onUpdated={loadData}
      />

      {/* FORM 16 PART B MODAL */}
      <Form16Modal
        isOpen={Boolean(form16Worker)}
        onClose={() => setForm16Worker(null)}
        worker={form16Worker}
        payrolls={payrolls}
        companyName={profile?.companyName || 'Factory Admin'}
      />

      {/* CONFLICT RESOLUTION MODAL */}
      <ConflictResolutionModal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        tenantId={profile?.tenantId}
        onResolved={async () => {
          if (profile?.tenantId) {
            const list = await conflictService.getUnresolvedPayrollConflicts(profile.tenantId, currentMonthStr);
            setUnresolvedConflicts(list);
          }
        }}
      />

      {/* STATUTORY FILING EXPORT PACK (ZIP) MODAL */}
      <StatutoryExportModal
        isOpen={isExportPackOpen}
        onClose={() => setIsExportPackOpen(false)}
        workers={workers}
        payrolls={payrolls}
        orgSettings={settings || { shifts: [], enableBreakTracking: false }}
        tenantName={profile?.companyName || 'Factory Admin'}
        currentMonthStr={currentMonthStr}
      />
    </div>
  );
};