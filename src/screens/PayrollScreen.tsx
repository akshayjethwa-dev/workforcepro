import React, { useState, useMemo, useEffect } from 'react';
import { IndianRupee, FileText, Download, CheckCircle, Clock, AlertTriangle, ChevronRight, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import { wageService } from '../services/wageService';
import { MonthlyPayroll, Worker, AttendanceRecord, Advance, OrgSettings } from '../types/index';
import { Payslip } from '../components/Payslip';

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

  useEffect(() => {
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
      } catch (err: any) {
        console.error("Failed to load payroll data", err);
        setFetchError(err.message || "Failed to load database records");
        toast.error("Could not load monthly payroll data");
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [profile, currentMonthStr]);

  const payrolls = useMemo(() => {
    if (!profile?.tenantId || workers.length === 0) return [];
    
    return workers.map(worker => {
      const alreadySaved = savedPayrolls.find(p => p.workerId === worker.id);
      if (alreadySaved) return alreadySaved;

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
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Monthly Payroll</h1>
          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
            <span>Wage calculations & printable payslips</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-600 font-semibold">
              {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-mono tabular-nums bg-white border border-slate-200/80 px-3 py-1.5 rounded-xl shadow-xs self-start sm:self-auto">
          Staff Ledger: <strong className="text-slate-900">{totalStaffCount} Operators</strong>
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

      {!fetchError && (
        <>
          {/* PAYROLL SUMMARY KPIS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Payout</span>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-amber-600 mt-2">
                ₹{pendingPayout.toLocaleString()}
              </div>
              <p className="text-xs text-slate-400 mt-1">Outstanding wages to settle</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Settled Payout</span>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-emerald-600 mt-2">
                ₹{paidPayout.toLocaleString()}
              </div>
              <p className="text-xs text-slate-400 mt-1">Disbursed to workers</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs sm:col-span-2 lg:col-span-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Wage Obligation</span>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-slate-900 mt-2">
                ₹{(pendingPayout + paidPayout).toLocaleString()}
              </div>
              <p className="text-xs text-slate-400 mt-1">Gross accrued across staff</p>
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

                  {/* ATTENDANCE & ADVANCES BREAKDOWN (Unboxed clean metadata with · separators) */}
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
                </div>

                {/* BOTTOM ACTION BUTTONS */}
                <div className="p-3 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      if (!limits?.payslipEnabled) {
                        toast.info("Generating Detailed Payslips is available on Pro & Enterprise plans.");
                        return;
                      }
                      setSelectedPayroll(payroll);
                    }}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-200/70 transition-colors"
                  >
                    <FileText size={14} className="text-slate-500" />
                    <span>View Payslip</span>
                  </button>

                  {payroll.status !== 'PAID' ? (
                    <button 
                      onClick={(e) => handleMarkAsPaid(payroll, e)}
                      className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 rounded-xl shadow-xs transition-all active:scale-95"
                    >
                      Mark Paid
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1 px-2 py-1">
                      <CheckCircle size={13} />
                      <span>Settled</span>
                    </span>
                  )}
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

    </div>
  );
};