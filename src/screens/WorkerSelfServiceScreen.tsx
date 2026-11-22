// src/screens/WorkerSelfServiceScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  Clock,
  CheckCircle2,
  Calendar,
  MapPin,
  FileText,
  IndianRupee,
  ShieldCheck,
  ArrowRight,
  HardHat,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { AttendanceRecord, ScreenName, Worker } from '../types/index';

interface WorkerSelfServiceScreenProps {
  onNavigate: (screen: ScreenName) => void;
}

export const WorkerSelfServiceScreen: React.FC<WorkerSelfServiceScreenProps> = ({
  onNavigate,
}) => {
  const { profile } = useAuth();
  const [workerRecord, setWorkerRecord] = useState<Worker | null>(null);
  const [recentAttendance, setRecentAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWorkerPortal = async () => {
      if (!profile?.tenantId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [workers, history] = await Promise.all([
          dbService.getWorkers(profile.tenantId),
          dbService.getAttendanceHistory(profile.tenantId),
        ]);

        const matched =
          workers.find((w) => w.id === profile.workerId) ||
          workers.find(
            (w) =>
              w.name.toLowerCase() === (profile.name || '').toLowerCase()
          ) ||
          workers[0] ||
          null;

        setWorkerRecord(matched);

        if (matched) {
          const ownLogs = history
            .filter((r) => r.workerId === matched.id)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
            .slice(0, 7);
          setRecentAttendance(ownLogs);
        }
      } catch (err) {
        console.warn('Worker self-service load notice:', err);
      } finally {
        setLoading(false);
      }
    };

    void loadWorkerPortal();
  }, [profile]);

  const today = new Date().toISOString().split('T')[0];
  const todayRecord = recentAttendance.find((r) => r.date?.startsWith(today));
  const presentDaysCount = recentAttendance.filter(
    (r) => r.status === 'PRESENT' || r.status === 'HALF_DAY'
  ).length;

  return (
    <div className="space-y-6 pb-10">
      {/* Worker Welcome Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center justify-center shrink-0">
              <HardHat size={24} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Worker Self-Service Portal
              </div>
              <h1 className="text-fluid-xl font-bold text-white truncate">
                {workerRecord?.name || profile?.name || 'Employee'}
              </h1>
              <p className="text-xs text-slate-300 mt-0.5">
                {workerRecord?.designation || 'Frontline Staff'} ·{' '}
                {workerRecord?.department || 'Operations'} ·{' '}
                {profile?.companyName || 'Organization'}
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-xs font-semibold text-white shrink-0">
            <ShieldCheck size={15} className="text-emerald-400 shrink-0" />
            <span>Personal Data Scope Only</span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Today&apos;s Status</span>
            <Clock size={16} className="text-blue-600" />
          </div>
          <div className="text-lg font-bold text-slate-900">
            {todayRecord ? todayRecord.status.replace('_', ' ') : 'Not Punched In Yet'}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {todayRecord?.checkIn
              ? `Punched in at ${todayRecord.checkIn}`
              : 'Use your assigned branch kiosk or WhatsApp punch to check in.'}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Recent Days Logged</span>
            <Calendar size={16} className="text-emerald-600" />
          </div>
          <div className="text-lg font-bold text-slate-900 font-mono tabular-nums">
            {presentDaysCount} / {Math.max(recentAttendance.length, 1)} days
          </div>
          <p className="text-xs text-slate-500 mt-1">Showing your most recent shifts</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">Assigned Branch</span>
            <MapPin size={16} className="text-indigo-600" />
          </div>
          <div className="text-lg font-bold text-slate-900 truncate">
            {workerRecord?.branchId === 'branch-anand'
              ? 'Anand Manufacturing Unit'
              : 'Main Branch (Head Office)'}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Wage Type: {workerRecord?.wageConfig?.type || 'DAILY'}
          </p>
        </div>
      </div>

      {/* Recent Personal Attendance Table + Quick Action */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">My Recent Attendance Logs</h2>
            <p className="text-xs text-slate-500">
              Read-only view of your personal attendance and shift hours
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('WORKER_HISTORY')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shrink-0 cursor-pointer"
          >
            <FileText size={14} />
            <span>View Full History &amp; Payslips</span>
            <ArrowRight size={13} />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading your records...</div>
        ) : recentAttendance.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <CheckCircle2 size={28} className="mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-medium text-slate-600">No attendance punches recorded yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentAttendance.map((rec) => (
              <div
                key={rec.id}
                className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 font-mono">{rec.date}</div>
                  <div className="text-[11px] text-slate-500">
                    Net Hours:{' '}
                    <span className="font-mono font-semibold text-slate-700">
                      {(rec.hours?.net ?? 0).toFixed(1)}h
                    </span>
                    {(rec.hours?.overtime ?? 0) > 0 && (
                      <span className="ml-2 text-emerald-700 font-mono font-semibold">
                        +{(rec.hours?.overtime ?? 0).toFixed(1)}h OT
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                    rec.status === 'PRESENT'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : rec.status === 'HALF_DAY'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {rec.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payslip Info Note */}
      <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 flex items-start gap-3">
        <div className="p-2 rounded-xl bg-blue-100 text-blue-700 shrink-0">
          <IndianRupee size={16} />
        </div>
        <div className="text-xs text-blue-900 leading-relaxed">
          <strong>Need your monthly payslip?</strong> Open <em>My History &amp; Payslips</em> from
          the sidebar or use the WhatsApp Magic Link sent by your HR team after payroll is locked.
        </div>
      </div>
    </div>
  );
};
