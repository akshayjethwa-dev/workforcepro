// src/screens/DashboardScreen.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle,
  Clock,
  ChevronRight,
  RefreshCw,
  PlayCircle,
  XCircle,
  Timer,
  Activity,
  Lock,
  MapPin,
  ArrowRight,
  Inbox,
  Navigation,
  ShieldAlert,
  AlertTriangle,
  Users,
  IndianRupee,
  Sliders,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { dbService } from '../services/db';
import { attendanceLogic } from '../services/attendanceLogic';
import {
  FnfSettlementRecord,
  InboxItem,
  OrgSettings,
  ScreenName,
  Worker,
} from '../types/index';
import { inboxService } from '../services/inboxService';
import { FieldStatusBadge } from '../components/FieldStatusBadge';
import { EmployeeCapBanner } from '../components/EmployeeCapBanner';
import { ShiftRouteMapModal } from '../components/ShiftRouteMapModal';
import { SupervisorSafetyMonitorModal } from '../components/SupervisorSafetyMonitorModal';
import { breadcrumbService } from '../services/breadcrumbService';
import { safetyCheckInService } from '../services/safetyCheckInService';
import { evaluateFnfDeadline, syncFnfBreachAlerts } from '../services/fnfService';
import { FnfDeadlineBadge } from '../components/FnfDeadlineBadge';
import { TruncatedText } from '../components/TruncatedText';

interface Props {
  onOpenKiosk: (branchId: string) => void;
  onNavigate?: (screen: ScreenName) => void;
}

/**
 * Computes the estimated monthly payroll run cost for active workers
 * using configured monthly/daily/piece-rate compensation plus overtime multiplier.
 */
function calculateEstimatedMonthlyPayroll(
  activeWorkers: Worker[],
  monthlyOvertimeHours: number,
  overtimeMultiplier: number
): { totalEstimate: number; baseEstimate: number; overtimeEstimate: number } {
  const DEFAULT_WORKING_DAYS = 26;
  let baseEstimate = 0;

  for (const w of activeWorkers) {
    const workingDays = w.wageConfig?.workingDaysPerMonth || w.wageConfig?.dailyMultiplier || DEFAULT_WORKING_DAYS;
    const allowances = w.wageConfig?.allowances
      ? Number(w.wageConfig.allowances.travel || 0) +
        Number(w.wageConfig.allowances.food || 0) +
        Number(w.wageConfig.allowances.nightShift || 0)
      : 0;

    if (w.wageConfig && Number(w.wageConfig.amount) > 0) {
      if (w.wageConfig.type === 'MONTHLY') {
        baseEstimate += Number(w.wageConfig.amount) + allowances;
      } else {
        baseEstimate += Number(w.wageConfig.amount) * workingDays + allowances;
      }
    } else if (w.monthlySalary && w.monthlySalary > 0) {
      baseEstimate += Number(w.monthlySalary) + allowances;
    } else if (w.dailyWage && w.dailyWage > 0) {
      baseEstimate += Number(w.dailyWage) * workingDays + allowances;
    } else if (w.hourlyWage && w.hourlyWage > 0) {
      baseEstimate += Number(w.hourlyWage) * 8 * workingDays + allowances;
    }
  }

  const avgHourlyRate =
    activeWorkers.length > 0
      ? baseEstimate / (activeWorkers.length * DEFAULT_WORKING_DAYS * 8)
      : 0;
  const overtimeEstimate = Math.round(monthlyOvertimeHours * avgHourlyRate * overtimeMultiplier);

  return {
    totalEstimate: Math.round(baseEstimate + overtimeEstimate),
    baseEstimate: Math.round(baseEstimate),
    overtimeEstimate,
  };
}

export const DashboardScreen: React.FC<Props> = ({ onOpenKiosk, onNavigate }) => {
  const { profile, activeRole, limits, branchScope } = useAuth();
  const { branding } = useTheme();

  const isTenantAdmin = activeRole === 'TENANT_ADMIN';

  const [stats, setStats] = useState({
    total: 0,
    present: 0,
    halfDay: 0,
    absent: 0,
    late: 0,
    pending: 0,
    onLeave: 0,
  });

  const [payrollEstimate, setPayrollEstimate] = useState({
    totalEstimate: 0,
    baseEstimate: 0,
    overtimeEstimate: 0,
  });

  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [selectedDashboardBranch, setSelectedDashboardBranch] = useState<string>(
    branchScope.isBranchScoped && branchScope.primaryBranchId
      ? branchScope.primaryBranchId
      : 'ALL'
  );

  useEffect(() => {
    if (branchScope.isBranchScoped && branchScope.primaryBranchId) {
      setSelectedDashboardBranch(branchScope.primaryBranchId);
    }
  }, [branchScope.isBranchScoped, branchScope.primaryBranchId]);

  const [showKioskModal, setShowKioskModal] = useState(false);
  const [selectedKioskBranch, setSelectedKioskBranch] = useState<string>('default');

  const [inboxPendingCount, setInboxPendingCount] = useState<number>(0);
  const [pendingInboxPreview, setPendingInboxPreview] = useState<InboxItem[]>([]);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [activeShiftCount, setActiveShiftCount] = useState(0);
  const [showSafetyMonitorModal, setShowSafetyMonitorModal] = useState(false);
  const [activePanicCount, setActivePanicCount] = useState(0);
  const [fnfAlerts, setFnfAlerts] = useState<FnfSettlementRecord[]>([]);

  const currentMonthLabel = useMemo(
    () => new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    []
  );
  const todayDateLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    []
  );

  const refreshData = async () => {
    if (!profile?.tenantId) return;
    setLoading(true);
    try {
      const branchOpt =
        branchScope.isBranchScoped && branchScope.primaryBranchId
          ? { branchId: branchScope.primaryBranchId }
          : undefined;

      const [workers, attendance, settings, attendanceHistory] = await Promise.all([
        dbService.getWorkers(profile.tenantId, branchOpt),
        dbService.getTodayAttendance(profile.tenantId, branchOpt),
        dbService.getOrgSettings(profile.tenantId),
        isTenantAdmin
          ? dbService.getAttendanceHistory(profile.tenantId, branchOpt).catch(() => [])
          : Promise.resolve([]),
      ]);

      const syncedFnf = isTenantAdmin
        ? await syncFnfBreachAlerts(
            profile.tenantId,
            profile.email || 'admin@workforcepro.in',
            settings
          ).catch(() => [] as FnfSettlementRecord[])
        : [];
      const activeFnf = syncedFnf.filter((r) => {
        if (r.status === 'SETTLED') return false;
        const wagePaid = r.paymentSchedules?.wageFnf?.status === 'PAID';
        return !wagePaid;
      });
      setFnfAlerts(activeFnf);

      if (isTenantAdmin) {
        const inboxPayload = await inboxService
          .getInboxItems(profile.tenantId, profile)
          .catch(() => ({ pending: [] as InboxItem[], done: [] as InboxItem[] }));
        setInboxPendingCount(inboxPayload.pending.length);
        setPendingInboxPreview(inboxPayload.pending.slice(0, 2));
      } else {
        setInboxPendingCount(0);
        setPendingInboxPreview([]);
      }

      setOrgSettings(settings);

      const liveShifts = breadcrumbService.getActiveShiftWorkers(profile.tenantId);
      setActiveShiftCount(liveShifts.length);

      const livePanics = safetyCheckInService.getActivePanicAlerts(profile.tenantId);
      setActivePanicCount(livePanics.length);

      const activeWorkers = workers.filter(
        (w) =>
          w.status === 'ACTIVE' &&
          (selectedDashboardBranch === 'ALL' ||
            (w.branchId || 'default') === selectedDashboardBranch)
      );

      const total = activeWorkers.length;
      const activeWorkerIds = new Set(activeWorkers.map((w) => w.id));

      // Calculate monthly payroll estimate for SMB Owner view
      if (isTenantAdmin) {
        const currentMonthPrefix = new Date().toISOString().slice(0, 7);
        const monthOvertimeHours = attendanceHistory
          .filter(
            (r) =>
              activeWorkerIds.has(r.workerId) &&
              typeof r.date === 'string' &&
              r.date.startsWith(currentMonthPrefix)
          )
          .reduce((sum, r) => sum + Number(r.hours?.overtime || 0), 0);
        const otMult = settings.overtimeMultiplier || 2.0;
        setPayrollEstimate(
          calculateEstimatedMonthlyPayroll(activeWorkers, monthOvertimeHours, otMult)
        );
      }

      let presentCount = 0;
      let halfDayCount = 0;
      let lateCount = 0;
      let onLeaveCount = 0;
      let pendingCount = 0;

      const filteredAttendance = attendance.filter((r) => activeWorkerIds.has(r.workerId));

      const processedActivity = filteredAttendance.map((record) => {
        const currentHours = attendanceLogic.calculateHours(
          record.timeline,
          settings.enableBreakTracking
        );

        const lastPunch =
          record.timeline && record.timeline.length > 0
            ? record.timeline[record.timeline.length - 1]
            : null;
        const isCurrentlyIn = lastPunch?.type === 'IN';

        let dynamicallyCalculatedLate = false;
        const shift =
          settings.shifts.find((s) => s.id === record.shiftId) || settings.shifts[0];
        const firstPunch = record.timeline?.find((p) => p.type === 'IN');

        if (firstPunch && shift) {
          const punchTime = new Date(firstPunch.timestamp);
          const [shiftHour, shiftMin] = shift.startTime.split(':').map(Number);
          const shiftStartTime = new Date(punchTime);
          shiftStartTime.setHours(shiftHour, shiftMin, 0, 0);

          const diffMs = punchTime.getTime() - shiftStartTime.getTime();
          const lateByMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));

          dynamicallyCalculatedLate = lateByMins > (shift.gracePeriodMins || 15);
        }

        let computedStatus = 'ABSENT';
        if (record.status === 'ON_LEAVE') {
          computedStatus = 'ON_LEAVE';
        } else if (currentHours >= 6) {
          computedStatus = 'PRESENT';
        } else if (currentHours >= 4) {
          computedStatus = 'HALF_DAY';
        } else if (isCurrentlyIn) {
          computedStatus = 'PENDING';
        } else {
          computedStatus = 'ABSENT';
        }

        if (dynamicallyCalculatedLate) {
          lateCount++;
        }

        return {
          ...record,
          currentHours,
          computedStatus,
          isCurrentlyIn,
          isLate: dynamicallyCalculatedLate,
        };
      });

      processedActivity.forEach((r) => {
        if (r.computedStatus === 'PRESENT') presentCount++;
        else if (r.computedStatus === 'HALF_DAY') halfDayCount++;
        else if (r.computedStatus === 'PENDING') pendingCount++;
        else if (r.computedStatus === 'ON_LEAVE') onLeaveCount++;
      });

      const attendedOrLeaved = presentCount + halfDayCount + pendingCount + onLeaveCount;
      const absentCount = Math.max(0, total - attendedOrLeaved);

      setStats({
        total,
        present: presentCount,
        halfDay: halfDayCount,
        absent: absentCount,
        late: lateCount,
        pending: pendingCount,
        onLeave: onLeaveCount,
      });

      const sorted = processedActivity.sort((a, b) => {
        const getLastTime = (r: any) => {
          if (r.timeline && r.timeline.length > 0) {
            return new Date(r.timeline[r.timeline.length - 1].timestamp).getTime();
          }
          return new Date(r.date).getTime();
        };
        return getLastTime(b) - getLastTime(a);
      });

      setRecentActivity(sorted);
    } catch (e) {
      console.error('Dashboard refresh error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [profile, selectedDashboardBranch, activeRole]);

  const handleKioskLaunch = () => {
    const branches = orgSettings?.branches || [];
    if (branches.length > 1) {
      setSelectedKioskBranch(branches[0].id);
      setShowKioskModal(true);
    } else {
      onOpenKiosk(branches[0]?.id || 'default');
    }
  };

  const workersPresentTotal = stats.present + stats.halfDay + stats.pending;
  const attendancePct =
    stats.total > 0 ? Math.min(100, Math.round((workersPresentTotal / stats.total) * 100)) : 0;

  const StatCard = ({ icon: Icon, value, label, subLabel, accentColor }: any) => (
    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-colors flex flex-col justify-between min-h-[7.25rem] min-w-0">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-xs font-medium text-slate-500 min-w-0 break-words">{label}</span>
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${accentColor}`}
        >
          <Icon size={17} />
        </div>
      </div>
      <div className="mt-2 min-w-0">
        <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 tracking-tight break-words">
          {value}
        </div>
        {subLabel && (
          <div className="text-xs text-slate-500 mt-1 flex items-center flex-wrap gap-1.5 min-w-0">
            <span className="break-words">{subLabel}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-12 min-w-0">
      {/* PERSISTENT EMPLOYEE CAP BANNER */}
      {isTenantAdmin && (
        <EmployeeCapBanner
          tenantId={profile?.tenantId || 'demo-tenant-id'}
          onNavigateToBilling={() => onNavigate && onNavigate('SETTINGS')}
        />
      )}

      {/* CLEAN EXECUTIVE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          {branding?.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt="Company logo"
              className="h-10 w-auto max-w-[100px] object-contain bg-white p-1 rounded-xl border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
              {profile?.companyName ? profile.companyName.charAt(0).toUpperCase() : 'W'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-fluid-xl font-bold tracking-tight text-slate-900 break-words">
              {branding?.appName || profile?.companyName || 'Business Overview'}
            </h1>
            <div className="text-fluid-xs text-slate-500 flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
              <span>{todayDateLabel}</span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="font-mono tabular-nums text-slate-600">
                {stats.total} active workers
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 self-start sm:self-auto max-w-full">
          {branchScope.isBranchScoped ? (
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold py-2 px-3 rounded-xl">
              <MapPin size={14} className="text-emerald-600 shrink-0" />
              <span>Branch: {branchScope.branchName}</span>
            </div>
          ) : (
            orgSettings?.branches &&
            orgSettings.branches.length > 1 && (
              <select
                aria-label="Filter by branch"
                className="bg-white border border-slate-200 text-xs font-medium text-slate-700 py-2 px-3 rounded-xl outline-none hover:border-slate-300 transition-colors min-h-[38px]"
                value={selectedDashboardBranch}
                onChange={(e) => setSelectedDashboardBranch(e.target.value)}
              >
                <option value="ALL">All Locations</option>
                {orgSettings.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )
          )}

          {/* Field Ops & Safety shortcuts stay accessible for Branch Managers */}
          {!isTenantAdmin && (
            <>
              <button
                type="button"
                onClick={() => setShowRouteModal(true)}
                className="px-3 py-2 bg-slate-900 rounded-xl text-white hover:bg-slate-800 transition-colors text-xs font-medium flex items-center gap-1.5 min-h-[38px] whitespace-nowrap shrink-0 cursor-pointer"
                title="Inspect live field routes and shift breadcrumbs"
              >
                <Navigation size={14} className="text-emerald-400" />
                <span className="hidden sm:inline">
                  Field Routes{activeShiftCount > 0 ? ` (${activeShiftCount})` : ''}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowSafetyMonitorModal(true)}
                className={`px-3 py-2 rounded-xl text-white transition-colors text-xs font-medium flex items-center gap-1.5 min-h-[38px] whitespace-nowrap shrink-0 cursor-pointer ${
                  activePanicCount > 0
                    ? 'bg-rose-700 hover:bg-rose-800'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
                title="Inspect lone worker check-in statuses and panic SOS alerts"
              >
                <ShieldAlert
                  size={14}
                  className={activePanicCount > 0 ? 'text-white' : 'text-rose-400'}
                />
                <span className="hidden sm:inline">
                  Safety Monitor{activePanicCount > 0 ? ` (${activePanicCount} SOS)` : ''}
                </span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={refreshData}
            title="Refresh metrics"
            aria-label="Refresh metrics"
            className="p-2 bg-white rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 transition-colors min-w-[38px] min-h-[38px] flex items-center justify-center cursor-pointer"
          >
            <RefreshCw
              size={16}
              className={loading ? 'animate-spin text-blue-600' : 'text-slate-600'}
            />
          </button>
        </div>
      </div>

      {/* =====================================================================
          SIMPLIFIED SMB OWNER VIEW (TENANT_ADMIN)
          Focus: 3 high-level business widgets — no complex HR config noise
         ===================================================================== */}
      {isTenantAdmin ? (
        <>
          {/* CRITICAL STATUTORY DEADLINE ALERT (Shown only if an active FnF breach exists) */}
          {fnfAlerts.length > 0 &&
            (() => {
              const breached = fnfAlerts.filter(
                (r) => evaluateFnfDeadline(r, Date.now(), orgSettings).isBreached
              );
              const isBreachPresent = breached.length > 0;
              if (!isBreachPresent) return null;
              const totalInterest = breached.reduce(
                (sum, r) =>
                  sum + evaluateFnfDeadline(r, Date.now(), orgSettings).accruedInterestPenalty,
                0
              );
              return (
                <div className="rounded-2xl p-4 sm:p-5 border border-rose-300 bg-rose-50 text-rose-950 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                      <AlertTriangle size={20} />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-bold text-sm text-rose-950">
                        Urgent: {breached.length} Final Settlement{breached.length > 1 ? 's' : ''}{' '}
                        Past Statutory Deadline
                      </h3>
                      <p className="text-xs text-rose-800">
                        Accrued statutory interest:{' '}
                        <span className="font-mono font-semibold tabular-nums">
                          ₹{Math.round(totalInterest).toLocaleString('en-IN')}
                        </span>
                        . Review and settle to stop penalties.
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {breached.slice(0, 2).map((rec) => (
                          <div
                            key={rec.id}
                            className="inline-flex items-center gap-2 bg-white px-2.5 py-1 rounded-lg border border-rose-200 text-xs"
                          >
                            <span className="font-semibold text-slate-900">{rec.workerName}</span>
                            <FnfDeadlineBadge record={rec} orgSettings={orgSettings} compact />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate('GRATUITY')}
                      className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start lg:self-center cursor-pointer"
                    >
                      <span>Review Settlements</span>
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              );
            })()}

          {/* 3 HIGH-LEVEL EXECUTIVE BUSINESS WIDGETS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-w-0">
            {/* WIDGET 1: Total Workers Present Today */}
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('ATTENDANCE')}
              className="text-left bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 hover:border-slate-300 transition-colors flex flex-col justify-between min-h-[11.5rem] group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Total Workers Present Today
                  </p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-bold font-mono tabular-nums text-slate-900 tracking-tight">
                      {workersPresentTotal}/{stats.total}
                    </span>
                    <span className="text-xs font-semibold font-mono tabular-nums text-emerald-700">
                      {attendancePct}% on site
                    </span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <Users size={20} />
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                    style={{ width: `${attendancePct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-mono tabular-nums truncate">
                    {stats.present + stats.halfDay} verified · {stats.pending} on shift ·{' '}
                    {stats.absent} absent
                  </span>
                  <ChevronRight
                    size={15}
                    className="text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-transform shrink-0"
                  />
                </div>
              </div>
            </button>

            {/* WIDGET 2: Estimated Payroll Cost this Month */}
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('PAYROLL')}
              className="text-left bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 hover:border-slate-300 transition-colors flex flex-col justify-between min-h-[11.5rem] group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Estimated Payroll Cost this Month
                  </p>
                  <div className="mt-2">
                    <span className="text-3xl font-bold font-mono tabular-nums text-slate-900 tracking-tight">
                      ₹{payrollEstimate.totalEstimate.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                  <IndianRupee size={20} />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="truncate">
                  {currentMonthLabel}
                  {payrollEstimate.overtimeEstimate > 0
                    ? ` · incl. ₹${payrollEstimate.overtimeEstimate.toLocaleString('en-IN')} OT`
                    : ` · ${stats.total} active staff`}
                </span>
                <span className="font-semibold text-blue-700 group-hover:text-blue-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                  <span>Payroll</span>
                  <ChevronRight
                    size={14}
                    className="group-hover:translate-x-0.5 transition-transform"
                  />
                </span>
              </div>
            </button>

            {/* WIDGET 3: Action Inbox: N Pending Approvals */}
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('INBOX')}
              className={`text-left p-5 sm:p-6 rounded-2xl border transition-colors flex flex-col justify-between min-h-[11.5rem] group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                inboxPendingCount > 0
                  ? 'bg-slate-900 text-white border-slate-800 hover:bg-slate-800'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    className={`text-xs font-medium ${
                      inboxPendingCount > 0 ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    Action Inbox
                  </p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-bold font-mono tabular-nums tracking-tight">
                      {inboxPendingCount}
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        inboxPendingCount > 0 ? 'text-amber-300' : 'text-emerald-700'
                      }`}
                    >
                      {inboxPendingCount === 1
                        ? 'Pending Approval'
                        : inboxPendingCount > 1
                        ? 'Pending Approvals'
                        : 'All Caught Up'}
                    </span>
                  </div>
                </div>
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    inboxPendingCount > 0
                      ? 'bg-white/10 text-amber-300'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Inbox size={20} />
                </div>
              </div>

              <div
                className={`mt-4 pt-3 border-t flex items-center justify-between gap-2 text-xs ${
                  inboxPendingCount > 0
                    ? 'border-white/10 text-slate-300'
                    : 'border-slate-100 text-slate-500'
                }`}
              >
                <span className="truncate">
                  {pendingInboxPreview.length > 0
                    ? pendingInboxPreview.map((i) => i.workerName.split(' ')[0]).join(', ') +
                      ' awaiting review'
                    : 'Advances, overtime & attendance alerts'}
                </span>
                <span
                  className={`font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    inboxPendingCount > 0 ? 'text-white' : 'text-slate-700'
                  }`}
                >
                  <span>Review</span>
                  <ArrowRight
                    size={14}
                    className="group-hover:translate-x-0.5 transition-transform"
                  />
                </span>
              </div>
            </button>
          </div>

          {/* QUICK BUSINESS ACTIONS ROW */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {limits?.kioskEnabled !== false ? (
                <button
                  type="button"
                  onClick={handleKioskLaunch}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-2 min-h-[38px] whitespace-nowrap cursor-pointer"
                >
                  <PlayCircle size={15} />
                  <span>Launch Attendance Kiosk</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('ATTENDANCE_KIOSK')}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-2 min-h-[38px] whitespace-nowrap cursor-pointer"
                >
                  <Lock size={14} />
                  <span>Attendance Kiosk (Starter)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onNavigate && onNavigate('WORKERS')}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-2 min-h-[38px] whitespace-nowrap cursor-pointer"
              >
                <Users size={15} className="text-slate-500" />
                <span>Manage Workers</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate && onNavigate('SETTINGS')}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-2 min-h-[38px] whitespace-nowrap cursor-pointer"
              >
                <span>Company, Billing &amp; Managers</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => onNavigate && onNavigate('ADVANCED_HR_SETTINGS')}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-auto px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Sliders size={14} />
              <span>Advanced HR Settings</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </>
      ) : (
        /* ===================================================================
           BRANCH MANAGER VIEW (Scoped Attendance Metrics — Zero Payroll Data)
           =================================================================== */
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 min-w-0">
          <StatCard
            icon={CheckCircle}
            value={`${workersPresentTotal}/${stats.total}`}
            label="Present Today"
            subLabel={`${stats.present} Full Day · ${stats.halfDay} Half Day`}
            accentColor="bg-emerald-50 text-emerald-700"
          />
          <StatCard
            icon={Timer}
            value={stats.pending}
            label="On Shift Now"
            subLabel="Active Punch Timeline"
            accentColor="bg-blue-50 text-blue-700"
          />
          <StatCard
            icon={Clock}
            value={stats.late}
            label="Late Arrivals"
            subLabel="Past Grace Window"
            accentColor="bg-amber-50 text-amber-700"
          />
          <StatCard
            icon={XCircle}
            value={stats.absent}
            label="Absent / Off"
            subLabel={`Branch Staff: ${stats.total}`}
            accentColor="bg-rose-50 text-rose-700"
          />
        </div>
      )}

      {/* KIOSK BRANCH PICKER MODAL */}
      {showKioskModal && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-100">
            <h2 className="text-base font-bold text-slate-900 mb-1">Select Kiosk Location</h2>
            <p className="text-xs text-slate-500 mb-5">
              Choose the location for this attendance terminal.
            </p>

            <div className="space-y-2 mb-6">
              {orgSettings?.branches?.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedKioskBranch(b.id)}
                  className={`w-full text-left p-3.5 rounded-xl border cursor-pointer flex items-center transition-colors ${
                    selectedKioskBranch === b.id
                      ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-semibold'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <MapPin
                    size={16}
                    className={
                      selectedKioskBranch === b.id
                        ? 'text-blue-600 mr-2.5 shrink-0'
                        : 'text-slate-400 mr-2.5 shrink-0'
                    }
                  />
                  <span className="text-xs font-semibold">{b.name}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowKioskModal(false)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowKioskModal(false);
                  onOpenKiosk(selectedKioskBranch);
                }}
                className="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-xl text-xs hover:bg-blue-700 transition-colors cursor-pointer"
              >
                Launch Terminal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIVE ATTENDANCE FEED */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/60">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-slate-500" />
            <h2 className="font-semibold text-slate-900 text-sm">Today&apos;s Attendance Activity</h2>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {recentActivity.length} logged today
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {recentActivity.map((record) => {
            const lastPunch =
              record.timeline && record.timeline.length > 0
                ? record.timeline[record.timeline.length - 1]
                : null;

            const timeStr = lastPunch
              ? lastPunch.timestamp
              : record.inTime?.timestamp || new Date().toISOString();

            const typeStr = lastPunch ? lastPunch.type : 'IN';
            const isOut = typeStr === 'OUT';

            let statusLabel = record.computedStatus;
            if (record.computedStatus === 'PRESENT') statusLabel = 'Present';
            else if (record.computedStatus === 'HALF_DAY') statusLabel = 'Half Day';
            else if (record.computedStatus === 'PENDING') statusLabel = 'On Shift';
            else if (record.computedStatus === 'ABSENT') statusLabel = 'Absent';

            return (
              <div
                key={record.id}
                className="p-3.5 sm:px-6 flex items-center justify-between gap-3 flex-wrap xs:flex-nowrap hover:bg-slate-50/70 transition-colors min-w-0"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-semibold text-xs border border-slate-200 shrink-0">
                    {record.workerName.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <TruncatedText
                          text={record.workerName}
                          modalTitle="Attendance Activity"
                          subtitle={`${isOut ? 'Check Out' : 'Check In'} at ${new Date(
                            timeStr
                          ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                          details={[
                            { label: 'Status', value: statusLabel },
                            {
                              label: 'Logged Hours',
                              value: `${record.currentHours.toFixed(1)} hrs`,
                              mono: true,
                            },
                            ...(record.isLate
                              ? [{ label: 'Punctuality', value: 'Late Arrival' }]
                              : []),
                          ]}
                          className="text-sm font-semibold text-slate-900"
                        />
                      </div>
                      <div className="shrink-0">
                        <FieldStatusBadge
                          status={record.computedStatus}
                          isLate={record.isLate}
                          size="sm"
                        />
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5 font-mono tabular-nums">
                      <span>
                        {isOut ? 'Check Out' : 'Check In'} at{' '}
                        {new Date(timeStr).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {record.isLate && <span className="text-rose-600 font-semibold">· Late</span>}
                      {lastPunch?.isOutOfGeofence && (
                        <span
                          className="text-amber-600 flex items-center gap-0.5"
                          title="Punched outside site radius"
                        >
                          <MapPin size={11} className="shrink-0" /> Outside Geofence
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 ml-auto">
                  <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                    {record.currentHours.toFixed(1)} hrs
                  </span>
                </div>
              </div>
            );
          })}

          {recentActivity.length === 0 && !loading && (
            <div className="p-10 text-center text-slate-400">
              <Clock className="mx-auto mb-2 text-slate-300" size={26} />
              <p className="text-sm font-medium text-slate-600">No check-ins recorded yet today</p>
              <p className="text-xs text-slate-400 mt-1">
                Workers appear here as they check in via Attendance Kiosk or manual punch.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* SHIFT-SCOPED BREADCRUMBS & FIELD ROUTE MODAL */}
      <ShiftRouteMapModal
        isOpen={showRouteModal}
        onClose={() => setShowRouteModal(false)}
        tenantId={profile?.tenantId || ''}
      />

      {/* LONE WORKER SAFETY COMMAND MODAL */}
      <SupervisorSafetyMonitorModal
        isOpen={showSafetyMonitorModal}
        onClose={() => setShowSafetyMonitorModal(false)}
        tenantId={profile?.tenantId || ''}
        branches={orgSettings?.branches}
      />
    </div>
  );
};