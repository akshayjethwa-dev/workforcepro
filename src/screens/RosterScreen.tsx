import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, Clock, Users, Plus, CheckCircle2, 
  AlertTriangle, ShieldAlert, Sparkles, RefreshCw, FileCheck, 
  ArrowRight, ArrowLeft, History, Filter, ChevronDown, Check, 
  Layers, User, Wand2, Bell, AlertCircle, X, ShieldCheck, Zap
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import { scheduleValidationService } from '../services/scheduleValidationService';
import { 
  RosterShift, 
  RosterSchedule, 
  ScheduleConflict, 
  ScheduleImpactAlert,
  ScheduleOverrideAudit 
} from '../types/scheduleValidation';
import { Worker, OrgSettings, AttendanceRecord, ShiftConfig } from '../types/index';
import { PrePublishValidationPanel } from '../components/PrePublishValidationPanel';

export const RosterScreen: React.FC = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const tenantId = profile?.tenantId || 'demo-tenant-id';

  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  
  // Weekly Roster State
  const [weekOffset, setWeekOffset] = useState<number>(0); // 0 = current week, 1 = next week
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [rosterStatus, setRosterStatus] = useState<'DRAFT' | 'PUBLISHED' | 'IMPACTED'>('DRAFT');
  const [impactAlerts, setImpactAlerts] = useState<ScheduleImpactAlert[]>([]);
  
  // UI Dialog States
  const [isValidationPanelOpen, setIsValidationPanelOpen] = useState(false);
  const [isAddShiftOpen, setIsAddShiftOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<ScheduleOverrideAudit[]>([]);

  // Add Shift Form State
  const [newShiftDate, setNewShiftDate] = useState('');
  const [newShiftName, setNewShiftName] = useState('Morning Production');
  const [newShiftStart, setNewShiftStart] = useState('08:00');
  const [newShiftEnd, setNewShiftEnd] = useState('16:30');
  const [newShiftWorkerId, setNewShiftWorkerId] = useState('');
  const [newShiftRequiredSkill, setNewShiftRequiredSkill] = useState('');

  // Calculate week dates (Monday to Sunday)
  const getWeekDates = (offset: number) => {
    const now = new Date();
    // Monday of current week
    const currentDay = now.getDay();
    const distanceToMonday = (currentDay + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMonday + offset * 7);

    const dates: { dateStr: string; dayName: string; formatted: string }[] = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      dates.push({
        dateStr,
        dayName: dayNames[i],
        formatted: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      });
    }
    return dates;
  };

  const weekDates = getWeekDates(weekOffset);
  const weekStart = weekDates[0].dateStr;
  const weekEnd = weekDates[6].dateStr;
  const rosterName = `Shift Roster: ${weekDates[0].formatted} - ${weekDates[6].formatted}`;

  // Load initial data
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [wList, orgSet, attList] = await Promise.all([
          dbService.getWorkers(tenantId),
          dbService.getOrgSettings(tenantId),
          dbService.getAttendanceHistory(tenantId).catch(() => []),
        ]);
        setWorkers(wList);
        setSettings(orgSet);
        setAttendanceRecords(attList);

        // Load existing published or draft rosters
        const savedRosters = scheduleValidationService.getAllRosters(tenantId);
        const matchingRoster = savedRosters.find(r => r.weekStartDate === weekStart);

        if (matchingRoster) {
          setShifts(matchingRoster.shifts);
          setRosterStatus(matchingRoster.status);
          setImpactAlerts(matchingRoster.impactAlerts || []);
        } else {
          // If no roster saved for this week, generate realistic initial schedule
          generateInitialShifts(wList, weekDates, orgSet);
        }
      } catch (err) {
        console.error('Failed to load roster data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [tenantId, weekOffset, weekStart]);

  // Generate realistic initial shifts for demonstrating ACs
  const generateInitialShifts = (
    workerPool: Worker[], 
    dates: { dateStr: string; dayName: string; formatted: string }[],
    orgSet: OrgSettings | null
  ) => {
    const list: RosterShift[] = [];
    const mon = dates[0].dateStr;
    const tue = dates[1].dateStr;
    const wed = dates[2].dateStr;
    const thu = dates[3].dateStr;
    const fri = dates[4].dateStr;
    const sat = dates[5].dateStr;
    const sun = dates[6].dateStr;

    const w1 = workerPool[0] || { id: 'worker-1', name: 'Ramesh Sharma', designation: 'CNC Operator' };
    const w2 = workerPool[1] || { id: 'worker-2', name: 'Priya Patel', designation: 'Quality Inspector' };
    const w3 = workerPool[2] || { id: 'worker-3', name: 'Amit Kumar', designation: 'Assembly Technician' };

    // Shift 1: Regular Monday Day Shift (Ramesh Sharma)
    list.push({
      id: `shift_${mon}_1`,
      tenantId,
      date: mon,
      shiftConfigId: 'shift_day',
      shiftName: 'Morning Production',
      startTime: '08:00',
      endTime: '16:30',
      durationHours: 8.5,
      assignedWorkerId: w1.id,
      assignedWorkerName: w1.name,
      workerDesignation: w1.designation,
      requiredSkill: 'CNC Operator',
      department: 'Production',
      status: 'DRAFT',
    });

    // Shift 2: Monday Overlapping Shift -> Triggers DOUBLE-BOOKING conflict on Ramesh
    list.push({
      id: `shift_${mon}_2_overlap`,
      tenantId,
      date: mon,
      shiftConfigId: 'shift_general',
      shiftName: 'General Maintenance (Overlapping)',
      startTime: '14:00',
      endTime: '20:00',
      durationHours: 6.0,
      assignedWorkerId: w1.id,
      assignedWorkerName: w1.name,
      workerDesignation: w1.designation,
      department: 'Maintenance',
      status: 'DRAFT',
    });

    // Shift 3 & 4: Rest-Period Violation scenario:
    // Tuesday Night Shift ending Wednesday 06:00 -> Wednesday Day Shift starting at 13:30 (Only 7.5 hrs rest < 11h required)
    list.push({
      id: `shift_${tue}_night`,
      tenantId,
      date: tue,
      shiftConfigId: 'shift_night',
      shiftName: 'Night Operations',
      startTime: '22:00',
      endTime: '06:00',
      durationHours: 8.0,
      assignedWorkerId: w3.id,
      assignedWorkerName: w3.name,
      workerDesignation: w3.designation,
      department: 'Assembly',
      status: 'DRAFT',
    });

    list.push({
      id: `shift_${wed}_day_short_rest`,
      tenantId,
      date: wed,
      shiftConfigId: 'shift_day',
      shiftName: 'Afternoon Turnaround',
      startTime: '13:30',
      endTime: '21:30',
      durationHours: 8.0,
      assignedWorkerId: w3.id,
      assignedWorkerName: w3.name,
      workerDesignation: w3.designation,
      department: 'Assembly',
      status: 'DRAFT',
    });

    // Shift 5: Overtime Risk scenario:
    // Priya Patel scheduled for multiple long shifts throughout week pushing projected hours > 48h limit
    [wed, thu, fri, sat].forEach((d, idx) => {
      list.push({
        id: `shift_priya_${d}`,
        tenantId,
        date: d,
        shiftConfigId: 'shift_day',
        shiftName: 'Quality Inspection Shift',
        startTime: '08:00',
        endTime: '18:00',
        durationHours: 10.0,
        assignedWorkerId: w2.id,
        assignedWorkerName: w2.name,
        workerDesignation: w2.designation,
        requiredSkill: 'Quality Inspector',
        department: 'Quality',
        status: 'DRAFT',
      });
    });

    // Shift 6: Skill Mismatch scenario:
    // Requires "CNC Operator", assigned to Amit Kumar ("Assembly Technician")
    list.push({
      id: `shift_${fri}_skill_mismatch`,
      tenantId,
      date: fri,
      shiftConfigId: 'shift_cnc',
      shiftName: 'Precision CNC Milling',
      startTime: '09:00',
      endTime: '17:30',
      durationHours: 8.5,
      assignedWorkerId: w3.id,
      assignedWorkerName: w3.name,
      workerDesignation: w3.designation,
      requiredSkill: 'CNC Operator', // Mismatch!
      department: 'Production',
      status: 'DRAFT',
    });

    // Shift 7: Open Shift / Coverage Gap scenario (No assigned worker)
    list.push({
      id: `shift_${sat}_open`,
      tenantId,
      date: sat,
      shiftConfigId: 'shift_day',
      shiftName: 'Weekend Dispatch & Packing',
      startTime: '08:00',
      endTime: '16:30',
      durationHours: 8.5,
      requiredSkill: 'Packaging',
      department: 'Logistics',
      status: 'DRAFT',
    });

    // Shift 8: Public Holiday Shift
    const holidayDate = orgSet?.holidays?.[0]?.date || sun;
    list.push({
      id: `shift_${holidayDate}_holiday`,
      tenantId,
      date: holidayDate,
      shiftConfigId: 'shift_holiday',
      shiftName: 'Plant Holiday Maintenance',
      startTime: '09:00',
      endTime: '15:00',
      durationHours: 6.0,
      assignedWorkerId: w1.id,
      assignedWorkerName: w1.name,
      workerDesignation: w1.designation,
      department: 'Maintenance',
      status: 'DRAFT',
    });

    setShifts(list);
    setRosterStatus('DRAFT');
  };

  // Run live validation metrics
  const liveConflicts = scheduleValidationService.validateRoster(shifts, {
    workers,
    settings: settings || undefined,
    attendanceHistory: attendanceRecords,
    currentOverrides: scheduleValidationService.getOverrides(tenantId),
    weekStartDate: weekStart,
    weekEndDate: weekEnd,
  });

  const liveBlockers = liveConflicts.filter(c => c.severity === 'BLOCK' && !c.isOverridden);
  const liveWarnings = liveConflicts.filter(c => c.severity === 'WARN' && !c.isOverridden);

  // Add a new shift manually
  const handleCreateShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShiftDate || !newShiftStart || !newShiftEnd) {
      toast.error('Date, start time, and end time are required.');
      return;
    }

    const assignedWorker = workers.find(w => w.id === newShiftWorkerId);
    const duration = scheduleValidationService.getRulesConfig().minRestHours; // fallback

    const newShift: RosterShift = {
      id: `shift_custom_${Date.now()}`,
      tenantId,
      date: newShiftDate,
      shiftConfigId: 'custom',
      shiftName: newShiftName,
      startTime: newShiftStart,
      endTime: newShiftEnd,
      durationHours: 8.0,
      assignedWorkerId: assignedWorker?.id,
      assignedWorkerName: assignedWorker?.name,
      workerDesignation: assignedWorker?.designation,
      requiredSkill: newShiftRequiredSkill || undefined,
      department: assignedWorker?.department || 'Production',
      status: 'DRAFT',
    };

    setShifts(prev => [...prev, newShift]);
    setIsAddShiftOpen(false);
    toast.success('Shift added to roster.');
  };

  // Edge Case: Simulate worker availability change after publish
  const handleSimulateAvailabilityChange = async () => {
    if (workers.length === 0) return;
    const targetWorker = workers[0];
    // Change worker's weekly off day to Monday (day 1)
    const newOffDays = [1]; // Monday off
    const alerts = await scheduleValidationService.handleWorkerAvailabilityChange(
      tenantId,
      targetWorker,
      newOffDays
    );

    if (alerts.length > 0) {
      setRosterStatus('IMPACTED');
      setImpactAlerts(alerts);
      toast.error(`Schedule Impacted! ${targetWorker.name} changed availability, conflicting with published shift.`);
    } else {
      toast.info('No published shifts conflicted with the availability change.');
    }
  };

  const handleOpenAuditHistory = () => {
    const logs = scheduleValidationService.getOverrides(tenantId);
    setAuditLogs(logs);
    setIsAuditModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Shift Roster &amp; Schedule Validation
            </h1>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
              rosterStatus === 'PUBLISHED'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : rosterStatus === 'IMPACTED'
                  ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
            }`}>
              {rosterStatus === 'PUBLISHED' ? 'Published' : rosterStatus === 'IMPACTED' ? 'Schedule Impacted' : 'Draft (Unpublished)'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Build and validate weekly shift rosters against overtime laws, mandatory 11h rest periods, and skill qualifications.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenAuditHistory}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 shadow-2xs transition-all active:scale-95"
            title="View schedule override audit logs"
          >
            <History size={15} className="text-slate-500" />
            <span>Audit Trail</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddShiftOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 shadow-2xs transition-all active:scale-95"
          >
            <Plus size={15} className="text-blue-600" />
            <span>Add Shift</span>
          </button>

          <button
            type="button"
            onClick={() => setIsValidationPanelOpen(true)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border shadow-2xs transition-all active:scale-95 ${
              liveBlockers.length > 0
                ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                : liveWarnings.length > 0
                  ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100'
            }`}
          >
            <ShieldAlert size={15} />
            <span>Validate ({liveConflicts.length} Flags)</span>
          </button>

          {/* Primary Publish Button */}
          <button
            type="button"
            onClick={() => setIsValidationPanelOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95"
          >
            <FileCheck size={16} />
            <span>Publish Roster</span>
          </button>
        </div>
      </div>

      {/* SCHEDULE IMPACTED ALERT BANNER (Edge Case) */}
      {rosterStatus === 'IMPACTED' && impactAlerts.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-rose-100 text-rose-700 mt-0.5 shrink-0">
              <AlertCircle size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-rose-900">Schedule Impacted: Worker Availability Changed</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-200 text-rose-900">
                  Post-Publish Alert
                </span>
              </div>
              <p className="text-xs text-rose-800 mt-0.5">
                {impactAlerts[0]?.message || 'A worker changed their declared weekly off day after this roster was published.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsValidationPanelOpen(true)}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              Resolve Conflict
            </button>
            <button
              type="button"
              onClick={() => {
                setRosterStatus('PUBLISHED');
                setImpactAlerts([]);
                toast.success('Schedule impact alert dismissed.');
              }}
              className="px-3 py-1.5 bg-white text-rose-700 border border-rose-300 hover:bg-rose-100 rounded-xl text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* QUICK CONFLICTS PREVIEW BAR */}
      <div className="p-4 rounded-2xl bg-slate-900 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0 border border-indigo-400/30">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>Schedule Integrity Check</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-indigo-200 font-mono">
                {shifts.length} Shifts Total
              </span>
            </div>
            <div className="text-xs text-slate-300 mt-0.5 flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${liveBlockers.length > 0 ? 'bg-rose-400 animate-ping' : 'bg-emerald-400'}`}></span>
                <strong>{liveBlockers.length}</strong> Blockers
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${liveWarnings.length > 0 ? 'bg-amber-400' : 'bg-slate-500'}`}></span>
                <strong>{liveWarnings.length}</strong> Warnings
              </span>
              <span>·</span>
              <span className="text-slate-400 text-[11px]">
                11h Min Rest Turnaround &amp; 48h Weekly Statutory Cap
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => generateInitialShifts(workers, weekDates, settings)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-medium border border-white/10 transition-colors"
            title="Load sample scenario with double booking, rest period and overtime conflicts"
          >
            <Wand2 size={13} className="text-indigo-300" />
            <span>Reset Demo Template</span>
          </button>

          <button
            type="button"
            onClick={handleSimulateAvailabilityChange}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 rounded-xl text-xs font-medium border border-rose-500/30 transition-colors"
            title="Test worker availability change after publish edge-case"
          >
            <Bell size={13} className="text-rose-300" />
            <span>Simulate Availability Change</span>
          </button>
        </div>
      </div>

      {/* WEEK PICKER & FILTER */}
      <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset(prev => prev - 1)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Previous Week"
          >
            <ArrowLeft size={16} />
          </button>

          <div className="flex items-center gap-2 font-bold text-xs text-slate-900 px-2">
            <CalendarIcon size={14} className="text-blue-600" />
            <span>{rosterName}</span>
          </div>

          <button
            type="button"
            onClick={() => setWeekOffset(prev => prev + 1)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Next Week"
          >
            <ArrowRight size={16} />
          </button>
        </div>

        {weekOffset !== 0 && (
          <button
            type="button"
            onClick={() => setWeekOffset(0)}
            className="text-xs text-blue-600 font-semibold hover:underline px-2"
          >
            Current Week
          </button>
        )}
      </div>

      {/* WEEKLY ROSTER GRID */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {weekDates.map((day) => {
          const dayShifts = shifts.filter(s => s.date === day.dateStr);
          const isToday = day.dateStr === new Date().toISOString().split('T')[0];
          const holiday = settings?.holidays?.find(h => h.date === day.dateStr);

          return (
            <div 
              key={day.dateStr}
              className={`rounded-2xl border p-3 flex flex-col min-h-[300px] transition-all ${
                isToday 
                  ? 'bg-blue-50/40 border-blue-300 shadow-xs ring-1 ring-blue-400/30' 
                  : 'bg-white border-slate-200 shadow-2xs'
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {day.dayName}
                  </div>
                  <div className="text-xs font-bold text-slate-900">
                    {day.formatted}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {holiday && (
                    <span 
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800"
                      title={`Public Holiday: ${holiday.name} (2x Pay)`}
                    >
                      Holiday
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    {dayShifts.length}
                  </span>
                </div>
              </div>

              {/* Shifts in Day */}
              <div className="flex-1 space-y-2 overflow-y-auto">
                {dayShifts.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center p-3 text-[11px] text-slate-400 italic">
                    No shifts assigned
                  </div>
                ) : (
                  dayShifts.map((shift) => {
                    const shiftConflicts = liveConflicts.filter(c => c.shiftId === shift.id || c.details?.conflictingShiftId === shift.id);
                    const hasBlock = shiftConflicts.some(c => c.severity === 'BLOCK' && !c.isOverridden);
                    const hasWarn = shiftConflicts.some(c => c.severity === 'WARN' && !c.isOverridden);
                    const isOverridden = shiftConflicts.some(c => c.isOverridden);

                    return (
                      <div
                        key={shift.id}
                        className={`p-2.5 rounded-xl border text-xs transition-all relative ${
                          hasBlock
                            ? 'bg-rose-50/80 border-rose-300 shadow-2xs'
                            : hasWarn
                              ? 'bg-amber-50/80 border-amber-300 shadow-2xs'
                              : isOverridden
                                ? 'bg-emerald-50/80 border-emerald-300'
                                : 'bg-slate-50/70 border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        {/* Conflict indicator tag */}
                        {(hasBlock || hasWarn || isOverridden) && (
                          <div className="absolute top-1.5 right-1.5">
                            {hasBlock ? (
                              <span className="w-2 h-2 rounded-full bg-rose-600 block animate-ping" title="Blocking Conflict" />
                            ) : hasWarn ? (
                              <span className="w-2 h-2 rounded-full bg-amber-500 block" title="Warning Conflict" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-emerald-500 block" title="Overridden" />
                            )}
                          </div>
                        )}

                        <div className="font-semibold text-slate-900 truncate pr-3">
                          {shift.shiftName}
                        </div>

                        <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock size={11} className="text-slate-400" />
                          <span>{shift.startTime} - {shift.endTime}</span>
                          <span className="font-mono">({shift.durationHours}h)</span>
                        </div>

                        {/* Assigned Worker Tile */}
                        <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                          {shift.assignedWorkerName ? (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                                {shift.assignedWorkerName.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold text-slate-800 truncate">
                                  {shift.assignedWorkerName}
                                </div>
                                <div className="text-[9px] text-slate-400 truncate">
                                  {shift.workerDesignation || 'Worker'}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                              Open Shift
                            </span>
                          )}

                          {shift.requiredSkill && (
                            <span 
                              className="text-[9px] px-1 py-0.5 rounded bg-slate-200/80 text-slate-700 font-mono ml-1 shrink-0 truncate max-w-[70px]"
                              title={`Required: ${shift.requiredSkill}`}
                            >
                              {shift.requiredSkill}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Quick Add Shift into Day */}
              <button
                type="button"
                onClick={() => {
                  setNewShiftDate(day.dateStr);
                  setIsAddShiftOpen(true);
                }}
                className="mt-2 w-full py-1.5 border border-dashed border-slate-200 hover:border-blue-400 text-slate-400 hover:text-blue-600 rounded-xl text-[10px] font-semibold transition-colors flex items-center justify-center gap-1"
              >
                <Plus size={11} />
                <span>Add Shift</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* SLIDING PRE-PUBLISH VALIDATION DRAWER */}
      <PrePublishValidationPanel
        isOpen={isValidationPanelOpen}
        onClose={() => setIsValidationPanelOpen(false)}
        shifts={shifts}
        workers={workers}
        settings={settings || undefined}
        attendanceHistory={attendanceRecords}
        onShiftsChange={(updated) => setShifts(updated)}
        onPublishSuccess={() => {
          setRosterStatus('PUBLISHED');
          setImpactAlerts([]);
        }}
        rosterName={rosterName}
        weekRange={{ start: weekStart, end: weekEnd }}
      />

      {/* MODAL: ADD SHIFT */}
      {isAddShiftOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Add Shift to Roster</h3>
              <button onClick={() => setIsAddShiftOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateShift} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Shift Name</label>
                <input
                  type="text"
                  required
                  value={newShiftName}
                  onChange={(e) => setNewShiftName(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="e.g. Morning Assembly, Night CNC"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={newShiftDate}
                    onChange={(e) => setNewShiftDate(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Required Skill / Role</label>
                  <input
                    type="text"
                    value={newShiftRequiredSkill}
                    onChange={(e) => setNewShiftRequiredSkill(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="e.g. CNC Operator"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={newShiftStart}
                    onChange={(e) => setNewShiftStart(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={newShiftEnd}
                    onChange={(e) => setNewShiftEnd(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assign Worker (Optional)</label>
                <select
                  value={newShiftWorkerId}
                  onChange={(e) => setNewShiftWorkerId(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Leave as Open Shift (Unassigned)</option>
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.designation || 'Worker'} - {w.department || 'Production'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddShiftOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  Save Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AUDIT TRAIL LOGS */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History size={18} className="text-slate-600" />
                <h3 className="text-sm font-bold text-slate-900">Schedule Override Audit Trail</h3>
              </div>
              <button onClick={() => setIsAuditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto mt-4 space-y-2.5 pr-1 scrollbar-thin">
              {auditLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs italic">
                  No schedule overrides have been recorded for this organization yet.
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{log.ruleName}</span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-slate-600 mt-1">
                      Target: <strong className="text-slate-800">{log.workerName || 'Worker'}</strong> (Shift: {log.shiftId})
                    </div>
                    <div className="mt-2 p-2 bg-white rounded-lg border border-slate-200 text-slate-800 text-[11px] italic">
                      "{log.reason}"
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Authorized by: {log.schedulerName} ({log.schedulerUserId})
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 mt-3 text-right">
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
