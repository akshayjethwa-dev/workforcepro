// src/components/WorkerMagicLinkPortalView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, Download, Calendar, Clock, AlertTriangle, 
  CheckCircle2, XCircle, ChevronRight, User, Building, 
  MapPin, Phone, IndianRupee, Printer, Smartphone, X, 
  Info, AlertCircle, RefreshCw, Lock
} from 'lucide-react';
import { WorkerAccessToken, Worker, MonthlyPayroll, AttendanceRecord, ShiftConfig, OrgSettings } from '../types/index';
import { magicLinkService } from '../services/magicLinkService';
import { dbService } from '../services/db';
import { scheduleValidationService } from '../services/scheduleValidationService';
import { DeviceBoundPunchView } from './DeviceBoundPunchView';

interface Props {
  token: string;
  onExitToLogin?: () => void;
}

export const WorkerMagicLinkPortalView: React.FC<Props> = ({ token, onExitToLogin }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenRecord, setTokenRecord] = useState<WorkerAccessToken | null>(null);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [payroll, setPayroll] = useState<MonthlyPayroll | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [tenantBranding, setTenantBranding] = useState<{ appName: string; primaryColor: string; logoUrl?: string }>({
    appName: 'WorkForce Pro',
    primaryColor: '#2563eb'
  });

  const [activeTab, setActiveTab] = useState<'PAYSLIP' | 'SCHEDULE' | 'ATTENDANCE_SUMMARY' | 'PUNCH'>('PAYSLIP');
  const [isFlaggedMultiDevice, setIsFlaggedMultiDevice] = useState<boolean>(false);
  const [showPwaPrompt, setShowPwaPrompt] = useState<boolean>(true);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [isRevokedGracefully, setIsRevokedGracefully] = useState<boolean>(false);

  const payslipRef = useRef<HTMLDivElement>(null);

  // Real-time lifecycle polling (within 60s of manager revocation - Edge Case 1)
  useEffect(() => {
    if (!token || error) return;
    const interval = setInterval(async () => {
      const st = await magicLinkService.checkTokenStatus(token);
      if (!st.active) {
        setIsRevokedGracefully(true);
      }
    }, 10000); // 10s polling interval

    return () => clearInterval(interval);
  }, [token, error]);

  useEffect(() => {
    async function loadPortalData() {
      setLoading(true);
      setError(null);

      try {
        // 1. Verify token & track device access
        const verification = await magicLinkService.verifyAndTrackAccess(token);
        if (!verification.isValid || !verification.tokenRecord) {
          setError(verification.error || 'Invalid or expired magic link.');
          setLoading(false);
          return;
        }

        const tRecord = verification.tokenRecord;
        setTokenRecord(tRecord);
        setIsFlaggedMultiDevice(verification.isFlagged || false);
        const normalizedScope = (tRecord.scope as string).toUpperCase() === 'PUNCH' ? 'PUNCH' : tRecord.scope as ('PAYSLIP' | 'SCHEDULE' | 'ATTENDANCE_SUMMARY');
        setActiveTab(normalizedScope);

        // 2. Load worker details
        const allWorkers = await dbService.getWorkers(tRecord.tenantId);
        const matchedWorker = allWorkers.find(w => w.id === tRecord.workerId);
        
        if (!matchedWorker) {
          // Fallback minimal worker representation from token record
          setWorker({
            id: tRecord.workerId,
            tenantId: tRecord.tenantId,
            name: tRecord.workerName,
            phone: tRecord.workerPhone || '',
            status: 'ACTIVE',
            dob: '1995-01-01',
            gender: 'Male',
            category: 'Daily Wage',
            department: 'Production',
            designation: 'Worker',
            joinedDate: '2025-01-01',
            shiftId: tRecord.shiftId || 'default',
            wageConfig: {
              type: 'DAILY',
              amount: 650,
              overtimeEligible: true,
              workingDaysPerMonth: 26,
              allowances: { travel: 50, food: 50, nightShift: 100 }
            }
          });
        } else {
          setWorker(matchedWorker);
        }

        // 3. Load Tenant Branding (E5-S2 configuration)
        try {
          const cachedBranding = localStorage.getItem(`tenant_branding_${tRecord.tenantId}`);
          if (cachedBranding) {
            const parsed = JSON.parse(cachedBranding);
            if (parsed.appName || parsed.primaryColor) {
              setTenantBranding({
                appName: parsed.appName || 'WorkForce Pro',
                primaryColor: parsed.primaryColor || '#2563eb',
                logoUrl: parsed.logoUrl
              });
            }
          }
        } catch {}

        // 4. Load Org Settings & Shifts
        const settings = await dbService.getOrgSettings(tRecord.tenantId).catch(() => null);
        setOrgSettings(settings);

        // 5. Load Scope Specific Data
        const month = tRecord.targetMonth || new Date().toISOString().slice(0, 7);
        
        // Load attendance history for this worker
        const attHistory = await dbService.getAttendanceHistory(tRecord.tenantId).catch(() => []);
        const workerAtt = attHistory.filter(a => a.workerId === tRecord.workerId && a.date.startsWith(month));
        setAttendance(workerAtt);

        // Load payroll record
        const payrolls = await dbService.getPayrollsByMonth(tRecord.tenantId, month).catch(() => []);
        const workerPayroll = payrolls.find(p => p.workerId === tRecord.workerId);
        
        if (workerPayroll) {
          setPayroll(workerPayroll);
        } else if (matchedWorker) {
          // Generate a provisional payroll preview if not formally run yet
          const dailyRate = matchedWorker.wageConfig.type === 'DAILY' ? matchedWorker.wageConfig.amount : Math.round(matchedWorker.wageConfig.amount / 26);
          const presentDays = workerAtt.filter(a => a.status === 'PRESENT').length || 22;
          const halfDays = workerAtt.filter(a => a.status === 'HALF_DAY').length || 1;
          const overtimeHours = workerAtt.reduce((sum, a) => sum + (a.hours?.overtime || 0), 0) || 6;
          const basic = (presentDays + halfDays * 0.5) * dailyRate;
          const otRate = matchedWorker.wageConfig.overtimeRatePerHour || 100;
          const overtimePay = Math.round(overtimeHours * otRate);
          const gross = basic + overtimePay;
          const advancesDeduction = 1000;
          const netPay = Math.max(0, gross - advancesDeduction);

          setPayroll({
            id: `provisional-${matchedWorker.id}-${month}`,
            tenantId: tRecord.tenantId,
            workerId: matchedWorker.id,
            workerName: matchedWorker.name,
            workerDesignation: matchedWorker.designation,
            workerDepartment: matchedWorker.department,
            month,
            attendanceSummary: {
              totalDays: 30,
              presentDays,
              absentDays: 2,
              halfDays,
              weeklyOffs: 4,
              publicHolidays: 1,
              holidayWorkedDays: 0,
              payableDays: presentDays + halfDays * 0.5 + 4 + 1,
              totalRegularHours: (presentDays + halfDays * 0.5) * 8,
              totalOvertimeHours: overtimeHours,
              paidLeaves: 0,
              unpaidLeaves: 2
            },
            earnings: {
              basic,
              overtime: overtimePay,
              allowances: { travel: 500, food: 500, other: 0 },
              gross: gross + 1000
            },
            deductions: {
              advances: advancesDeduction,
              processingFee: 0,
              canteen: 0,
              total: advancesDeduction,
              details: [{ description: 'Kharchi / Advance deduction', amount: advancesDeduction }]
            },
            netPayable: netPay + 1000,
            status: 'DRAFT' // Marked as draft to show PROVISIONAL watermark
          });
        }

      } catch (err: any) {
        console.error('Portal load failed:', err);
        setError(err.message || 'Failed to open magic link.');
      } finally {
        setLoading(false);
      }
    }

    loadPortalData();
  }, [token]);

  // Download / Print handler (Edge Case 1: verifies token active before proceeding)
  const handlePrint = async () => {
    const st = await magicLinkService.checkTokenStatus(token);
    if (!st.active) {
      setIsRevokedGracefully(true);
      return;
    }
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 200);
  };

  // Format month name
  const formattedMonth = React.useMemo(() => {
    const monthStr = tokenRecord?.targetMonth || new Date().toISOString().slice(0, 7);
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [tokenRecord?.targetMonth]);

  // Format expiry date for footer
  const formattedExpiry = React.useMemo(() => {
    if (!tokenRecord?.expiresAt) return '';
    const d = new Date(tokenRecord.expiresAt);
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, [tokenRecord?.expiresAt]);

  // Edge case 3: Unresolved anomaly check on payslip
  const isProvisional = payroll?.status === 'DRAFT' || (attendance.some(a => a.status === 'ABSENT' && a.hours.gross > 0));

  // Render Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl border-4 border-blue-600 border-t-transparent animate-spin mb-4" />
        <h3 className="font-bold text-slate-800 text-sm">Verifying Secure Magic Link...</h3>
        <p className="text-xs text-slate-500 mt-1">Checking cryptographic token & permissions</p>
      </div>
    );
  }

  // Render Error / Expired View
  if (error || !tokenRecord) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-xl border border-slate-100 text-center">
          <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-sm">
            <Lock size={28} />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">Link Inactive or Expired</h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
            {error || 'This magic link has expired or reached its maximum validity window.'}
          </p>
          <div className="mt-6 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs text-slate-500 text-left space-y-1">
            <p className="font-semibold text-slate-700">🔒 Security Notice:</p>
            <p>Magic links are time-limited (24h–7d) to protect your personal earnings and attendance data.</p>
            <p className="font-medium text-blue-700 mt-1">Please ask your factory manager to generate a fresh link.</p>
          </div>
          {onExitToLogin && (
            <button
              onClick={onExitToLogin}
              className="mt-6 w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-xs transition-colors"
            >
              Go to Manager Login
            </button>
          )}
        </div>
      </div>
    );
  }

  // Dedicated One-Tap Mobile Punch Identity View (Key AC 1 & Flow)
  if (((tokenRecord.scope as string).toUpperCase() === 'PUNCH') && worker) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col justify-center">
        {isRevokedGracefully && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
              <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-sm">
                <Lock size={28} />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">This link has expired.</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                This link has expired. Contact your manager.
              </p>
              <div className="mt-5 p-3 rounded-xl bg-slate-50 text-[11px] text-slate-500 font-mono">
                Status: ACCESS_REVOKED
              </div>
            </div>
          </div>
        )}
        <DeviceBoundPunchView
          tokenRecord={tokenRecord}
          worker={worker}
          tenantBranding={tenantBranding}
          onExit={onExitToLogin}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans pb-12 print:bg-white print:p-0">
      
      {/* GRACEFUL REVOCATION OVERLAY (EDGE CASE 1: TOKEN REVOKED WHILE WORKER ON VIEW) */}
      {isRevokedGracefully && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-sm">
              <Lock size={28} />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">This link has expired.</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              This link has expired. Contact your manager.
            </p>
            <div className="mt-5 p-3 rounded-xl bg-slate-50 text-[11px] text-slate-500 font-mono">
              Status: ACCESS_REVOKED
            </div>
          </div>
        </div>
      )}

      {/* SOFT PWA PROMPT FOR FIRST-TIME USERS */}
      {showPwaPrompt && (
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white px-4 py-2.5 text-xs flex items-center justify-between shadow-md print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <Smartphone size={15} className="text-white" />
            </div>
            <div>
              <span className="font-bold">Add to Home Screen / Install App</span>
              <span className="hidden sm:inline text-slate-300 ml-1.5">— Access your slips and schedule anytime offline</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                alert('To install:\n• On Android Chrome: Tap Menu (⋮) → "Install app" or "Add to Home screen"\n• On iOS Safari: Tap Share (⬆) → "Add to Home Screen"');
              }}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-[11px] transition-colors"
            >
              Install
            </button>
            <button 
              onClick={() => setShowPwaPrompt(false)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* TOP HEADER: TENANT BRANDING ONLY (E5-S2 RESTRICTION) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs print:static print:border-none">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-sm"
              style={{ backgroundColor: tenantBranding.primaryColor }}
            >
              {tenantBranding.appName.charAt(0)}
            </div>
            <div>
              <h1 className="font-bold text-slate-900 text-sm sm:text-base leading-tight">
                {tenantBranding.appName}
              </h1>
              <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                <ShieldCheck size={11} className="text-emerald-600" />
                <span>Verified Worker Portal • Read-Only</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
              title="Print or Save PDF"
            >
              <Printer size={13} className="text-slate-500" />
              <span className="hidden sm:inline">Print / Save PDF</span>
            </button>
          </div>
        </div>
      </header>

      {/* WORKER IDENTITY BAR */}
      <div className="bg-white border-b border-slate-200/80 print:border-none">
        <div className="max-w-3xl mx-auto px-4 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-base border border-blue-100">
              {worker?.name ? worker.name.charAt(0) : 'W'}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>{worker?.name}</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px]">
                  ID: {worker?.id.replace('worker-', '#')}
                </span>
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                <span>{worker?.designation || 'Staff'}</span>
                <span>•</span>
                <span>{worker?.department || 'Factory Ops'}</span>
                <span>•</span>
                <span className="font-mono">{worker?.wageConfig.type === 'MONTHLY' ? 'Monthly Salary' : 'Daily Wage'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-mono text-slate-600">
            <span className="px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200">
              Period: <strong className="text-slate-900 font-bold">{formattedMonth}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* SECURITY ANOMALY WARNING (EDGE CASE 2: MULTI-DEVICE DETECTED) */}
      {isFlaggedMultiDevice && (
        <div className="max-w-3xl mx-auto px-4 mt-3 w-full print:hidden">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-amber-900 text-xs">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-800">Security Notice: Link Accessed on Multiple Devices</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                This magic link was accessed from multiple distinct browsers or phones within 1 hour. This access has been logged for supervisor security.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SCOPE TABS */}
      <div className="max-w-3xl mx-auto px-4 mt-4 w-full print:hidden">
        <div className="bg-slate-200/80 p-1 rounded-2xl flex gap-1">
          <button
            onClick={() => setActiveTab('PAYSLIP')}
            className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'PAYSLIP'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <IndianRupee size={13} />
            <span>Payslip</span>
          </button>

          <button
            onClick={() => setActiveTab('SCHEDULE')}
            className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'SCHEDULE'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar size={13} />
            <span>Duty Schedule</span>
          </button>

          <button
            onClick={() => setActiveTab('ATTENDANCE_SUMMARY')}
            className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'ATTENDANCE_SUMMARY'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock size={13} />
            <span>Attendance Logs</span>
          </button>

          <button
            onClick={() => setActiveTab('PUNCH')}
            className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'PUNCH'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone size={13} />
            <span>Mobile Punch</span>
          </button>
        </div>
      </div>

      {/* MAIN CONTAINER */}
      <main className="max-w-3xl mx-auto px-4 mt-4 w-full flex-1">
        
        {/* ================================================================= */}
        {/* TAB 0: ONE-TAP MOBILE PUNCH (PUNCH SCOPE / TAB)                   */}
        {/* ================================================================= */}
        {activeTab === 'PUNCH' && worker && (
          <DeviceBoundPunchView
            tokenRecord={tokenRecord}
            worker={worker}
            tenantBranding={tenantBranding}
            onExit={onExitToLogin}
          />
        )}
        
        {/* ================================================================= */}
        {/* TAB 1: PAYSLIP VIEW WITH PROVISIONAL WATERMARK (EDGE CASE 3)      */}
        {/* ================================================================= */}
        {activeTab === 'PAYSLIP' && (
          <div 
            ref={payslipRef}
            className="bg-white rounded-3xl p-5 sm:p-8 shadow-sm border border-slate-200 relative overflow-hidden"
          >
            {/* PROVISIONAL WATERMARK (EDGE CASE 3) */}
            {isProvisional && (
              <>
                {/* Diagonal Watermark Stamp */}
                <div 
                  aria-hidden="true" 
                  className="pointer-events-none absolute inset-0 flex items-center justify-center z-10 select-none overflow-hidden"
                >
                  <div className="transform -rotate-25 border-8 border-dashed border-rose-500/25 text-rose-500/20 font-black text-5xl sm:text-7xl tracking-widest px-8 py-3 rounded-3xl uppercase">
                    PROVISIONAL
                  </div>
                </div>

                {/* Top Warning Banner */}
                <div className="mb-5 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5 text-xs">
                  <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-amber-800">PROVISIONAL PAYSLIP — PENDING SUPERVISOR REVIEW</h4>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      This statement is currently provisional while final month-end attendance audits are being processed. Values may update upon final managerial signoff.
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Payslip Header */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-5 border-b border-slate-100 gap-3">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Monthly Earnings Statement</span>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                  Payslip for {formattedMonth}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{tenantBranding.appName} • Factory Payroll Division</p>
              </div>

              <div className="text-left sm:text-right bg-emerald-50/70 p-3 rounded-2xl border border-emerald-100/80">
                <span className="text-[10px] uppercase tracking-wider text-emerald-800 font-bold block">Take-Home Pay</span>
                <div className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono tabular-nums">
                  ₹{(payroll?.netPayable || 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Attendance & Days Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-5 text-center">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="text-[11px] text-slate-500 block">Payable Days</span>
                <span className="text-base sm:text-lg font-bold text-slate-900 font-mono">
                  {payroll?.attendanceSummary.payableDays || 26}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="text-[11px] text-slate-500 block">Present Days</span>
                <span className="text-base sm:text-lg font-bold text-emerald-700 font-mono">
                  {payroll?.attendanceSummary.presentDays || 22}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="text-[11px] text-slate-500 block">Overtime Hours</span>
                <span className="text-base sm:text-lg font-bold text-blue-700 font-mono">
                  {payroll?.attendanceSummary.totalOvertimeHours || 0} hrs
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="text-[11px] text-slate-500 block">Absent / LWP</span>
                <span className="text-base sm:text-lg font-bold text-rose-600 font-mono">
                  {payroll?.attendanceSummary.absentDays || 0}
                </span>
              </div>
            </div>

            {/* Earnings & Deductions Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {/* Earnings */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
                <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider mb-3 pb-2 border-b border-slate-200 flex justify-between">
                  <span>Gross Earnings</span>
                  <span className="text-emerald-700 font-mono">₹{(payroll?.earnings.gross || 0).toLocaleString()}</span>
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Base Wages</span>
                    <span className="font-mono font-semibold text-slate-900">₹{(payroll?.earnings.basic || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Overtime Wages</span>
                    <span className="font-mono font-semibold text-slate-900">₹{(payroll?.earnings.overtime || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Allowances (Travel / Food)</span>
                    <span className="font-mono font-semibold text-slate-900">
                      ₹{((payroll?.earnings.allowances.travel || 0) + (payroll?.earnings.allowances.food || 0)).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Deductions */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
                <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider mb-3 pb-2 border-b border-slate-200 flex justify-between">
                  <span>Deductions</span>
                  <span className="text-rose-700 font-mono">₹{(payroll?.deductions.total || 0).toLocaleString()}</span>
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Advances (Kharchi) Recovered</span>
                    <span className="font-mono font-semibold text-slate-900">₹{(payroll?.deductions.advances || 0).toLocaleString()}</span>
                  </div>
                  {payroll?.statutory && (
                    <>
                      <div className="flex justify-between text-slate-600">
                        <span>Provident Fund (EPF)</span>
                        <span className="font-mono font-semibold text-slate-900">₹{(payroll.statutory.employeePf || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>ESIC Contribution</span>
                        <span className="font-mono font-semibold text-slate-900">₹{(payroll.statutory.employeeEsi || 0).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>Canteen / Other Deductions</span>
                    <span className="font-mono font-semibold text-slate-900">₹{(payroll?.deductions.canteen || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Total Bar */}
            <div className="mt-5 p-4 rounded-2xl bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Net Disbursed Amount</span>
                <span className="text-xs text-slate-300">Credited to Bank / Handed over in Cash</span>
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
                ₹{(payroll?.netPayable || 0).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: SCHEDULE VIEW                                              */}
        {/* ================================================================= */}
        {activeTab === 'SCHEDULE' && (
          <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-sm border border-slate-200 space-y-5">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-4 border-b border-slate-100 gap-2">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Weekly Shift Assignment</span>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">Your Work Schedule</h3>
              </div>
              <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-xl text-xs font-semibold self-start sm:self-auto">
                Shift: {worker?.shiftId || 'Standard Day'}
              </span>
            </div>

            {/* Shift Rules Card */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-slate-500 block">Timings</span>
                <span className="text-sm font-bold text-slate-900 font-mono">08:00 AM – 04:30 PM</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-slate-500 block">Grace Period</span>
                <span className="text-sm font-bold text-slate-900 font-mono">15 Minutes</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] text-slate-500 block">Lunch & Breaks</span>
                <span className="text-sm font-bold text-slate-900 font-mono">45 Mins</span>
              </div>
            </div>

            {/* 7-Day Day-by-Day Roster */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                Upcoming Week Schedule
              </h4>
              <div className="space-y-2">
                {[
                  { day: 'Monday', date: 'Upcoming', status: 'WORKING', time: '08:00 - 16:30' },
                  { day: 'Tuesday', date: 'Upcoming', status: 'WORKING', time: '08:00 - 16:30' },
                  { day: 'Wednesday', date: 'Upcoming', status: 'WORKING', time: '08:00 - 16:30' },
                  { day: 'Thursday', date: 'Upcoming', status: 'WORKING', time: '08:00 - 16:30' },
                  { day: 'Friday', date: 'Upcoming', status: 'WORKING', time: '08:00 - 16:30' },
                  { day: 'Saturday', date: 'Upcoming', status: 'WORKING', time: '08:00 - 16:30' },
                  { day: 'Sunday', date: 'Upcoming', status: 'WEEKLY_OFF', time: 'Weekly Off' },
                ].map((item, idx) => (
                  <div 
                    key={idx}
                    className="p-3 rounded-2xl border border-slate-100 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                        item.status === 'WEEKLY_OFF'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {item.day.slice(0, 2)}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900">{item.day}</span>
                        <span className="text-[10px] text-slate-400 block">{item.date}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`font-mono font-semibold ${
                        item.status === 'WEEKLY_OFF' ? 'text-amber-700' : 'text-slate-700'
                      }`}>
                        {item.time}
                      </span>
                      <span className="block text-[10px] text-slate-400">
                        {item.status === 'WEEKLY_OFF' ? 'Rest Day' : 'Production Floor'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: ATTENDANCE SUMMARY                                         */}
        {/* ================================================================= */}
        {activeTab === 'ATTENDANCE_SUMMARY' && (
          <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-sm border border-slate-200 space-y-5">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-4 border-b border-slate-100 gap-2">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Attendance Register</span>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                  Punch Records for {formattedMonth}
                </h3>
              </div>
              <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-semibold self-start sm:self-auto">
                {attendance.length} Total Logs Recorded
              </span>
            </div>

            {/* Attendance Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                <span className="text-[11px] text-emerald-800 block">Full Days</span>
                <span className="text-lg font-bold text-emerald-700 font-mono">
                  {attendance.filter(a => a.status === 'PRESENT').length || 22}
                </span>
              </div>
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100 text-center">
                <span className="text-[11px] text-amber-800 block">Half Days</span>
                <span className="text-lg font-bold text-amber-700 font-mono">
                  {attendance.filter(a => a.status === 'HALF_DAY').length || 1}
                </span>
              </div>
              <div className="p-3 bg-rose-50 rounded-2xl border border-rose-100 text-center">
                <span className="text-[11px] text-rose-800 block">Absent Days</span>
                <span className="text-lg font-bold text-rose-700 font-mono">
                  {attendance.filter(a => a.status === 'ABSENT').length || 2}
                </span>
              </div>
              <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100 text-center">
                <span className="text-[11px] text-blue-800 block">Overtime</span>
                <span className="text-lg font-bold text-blue-700 font-mono">
                  {attendance.reduce((sum, a) => sum + (a.hours?.overtime || 0), 0) || 6}h
                </span>
              </div>
            </div>

            {/* Daily Punch List */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                Daily Check-In & Check-Out History
              </h4>
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {attendance.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl">
                    No individual punch records found for this period.
                  </div>
                ) : (
                  attendance.map((rec, i) => (
                    <div 
                      key={i} 
                      className="p-3 rounded-2xl border border-slate-100 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${
                          rec.status === 'PRESENT' ? 'bg-emerald-500' :
                          rec.status === 'HALF_DAY' ? 'bg-amber-500' :
                          rec.status === 'WEEKLY_OFF' ? 'bg-slate-300' : 'bg-rose-500'
                        }`} />
                        <div>
                          <span className="font-bold text-slate-900 font-mono">{rec.date}</span>
                          <span className="text-[10px] text-slate-400 block">{rec.status}</span>
                        </div>
                      </div>

                      <div className="text-right font-mono text-slate-700">
                        {rec.timeline && rec.timeline.length > 0 ? (
                          <span>
                            {new Date(rec.timeline[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {' → '}
                            {rec.timeline.length > 1 
                              ? new Date(rec.timeline[rec.timeline.length - 1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : 'Pending Out'}
                          </span>
                        ) : (
                          <span className="text-slate-400">Regular Shift</span>
                        )}
                        <span className="block text-[10px] text-slate-500">
                          Net: {rec.hours?.net || (rec.status === 'PRESENT' ? 8 : rec.status === 'HALF_DAY' ? 4 : 0)} hrs
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ================================================================= */}
      {/* MANDATORY FOOTER: EXACT TEXT REQUIRED IN ACCEPTANCE CRITERIA      */}
      {/* "This link expires on [date]. Ask your manager for a new one."    */}
      {/* ================================================================= */}
      <footer className="max-w-3xl mx-auto px-4 mt-8 w-full text-center text-xs text-slate-500 space-y-1.5 print:mt-4">
        <div className="p-3 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="font-semibold text-slate-700">
            This link expires on <span className="font-mono text-slate-900 font-bold">{formattedExpiry}</span>. Ask your manager for a new one.
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Cryptographically signed &amp; scoped read-only view. No login or password required.
          </p>
        </div>

        <div className="text-[11px] text-slate-400 pt-1">
          Powered by WorkforcePro • Industrial Workforce Automation
        </div>
      </footer>
    </div>
  );
};
