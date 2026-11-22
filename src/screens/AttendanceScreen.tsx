import { ConflictResolutionModal } from '../components/ConflictResolutionModal';
import { conflictService } from '../services/conflictService';
import { GitMerge } from 'lucide-react';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import { Mic, MicOff, QrCode } from 'lucide-react';
import { useVoiceDictation } from '../hooks/useVoiceDictation';
import { NumericKeypadModal } from '../components/NumericKeypadModal';
import { ConstrainedVoiceInput } from '../components/ConstrainedVoiceInput';
import { FrontlineNumericStepper } from '../components/FrontlineNumericStepper';
import React, { useState, useEffect } from 'react';
import { 
  User, 
  CheckCircle, 
  Clock, 
  Calendar, 
  AlertCircle, 
  LogIn, 
  LogOut, 
  Loader2, 
  ChevronDown, 
  ChevronUp, 
  ArrowRight, 
  MapPin, 
  WifiOff,
  ShieldCheck,
  Hand,
  Sparkles,
  Zap,
  Sun,
  IndianRupee,
  Navigation,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';
import { dbService } from '../services/db';
import { attendanceLogic } from '../services/attendanceLogic';
import { syncService } from '../services/syncService';
import { Worker, AttendanceRecord, OrgSettings, Advance } from '../types/index';
import { geoUtils } from '../utils/geo';
import { FRONTLINE_TOUCH, triggerFrontlineHaptic } from '../utils/frontlineTouch';
import { FrontlineWipeOverlay } from '../components/FrontlineWipeOverlay';
import { FrontlineErgonomicsModal } from '../components/FrontlineErgonomicsModal';
import { FieldStatusBadge } from '../components/FieldStatusBadge';
import { TruncatedText } from '../components/TruncatedText';
import { ResponsiveDataTable, ResponsiveColumn } from '../components/ResponsiveDataTable';
import { A11yAuditModal } from '../components/A11yAuditModal';
import { WorkerEwaModal } from '../components/WorkerEwaModal';
import { ShiftRouteMapModal } from '../components/ShiftRouteMapModal';
import { SupervisorSafetyMonitorModal } from '../components/SupervisorSafetyMonitorModal';
import { breadcrumbService } from '../services/breadcrumbService';
import { safetyCheckInService } from '../services/safetyCheckInService';

export const AttendanceScreen: React.FC = () => {
  const { profile, branchScope } = useAuth();
  const { toast } = useToast();
  const { isFieldMode, toggleFieldMode } = useTheme();
  const [isA11yModalOpen, setA11yModalOpen] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceRecord>>({});
  const [settings, setSettings] = useState<OrgSettings>({ shifts: [], enableBreakTracking: false });
  const [allAdvances, setAllAdvances] = useState<Advance[]>([]);
  const [allAttendanceHistory, setAllAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [ewaModalWorker, setEwaModalWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'ABSENT' | 'LEAVE'>('ALL');
  
  // Frontline Ergonomics & Touch Target State
  const [selectedQuickWorkerId, setSelectedQuickWorkerId] = useState<string>('');
  const [isErgonomicsModalOpen, setIsErgonomicsModalOpen] = useState(false);
  const [isAuditOverlayActive, setIsAuditOverlayActive] = useState(false);
  const [isThumbReachMode, setIsThumbReachMode] = useState(false);
  const [isScreenLockedForWipe, setIsScreenLockedForWipe] = useState(false);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [unresolvedConflictsCount, setUnresolvedConflictsCount] = useState(0);
  const [isNumericKeypadOpen, setIsNumericKeypadOpen] = useState(false);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');
  
  // Frontline Leave / Field Reason Modal state
  const [leaveModalWorker, setLeaveModalWorker] = useState<Worker | null>(null);
  const [selectedLeaveReason, setSelectedLeaveReason] = useState('Sick / Medical Leave');

  // Shift-Scoped Breadcrumbs Modal State (Key AC 6)
  const [showShiftRouteModal, setShowShiftRouteModal] = useState<boolean>(false);
  const [selectedWorkerForRoute, setSelectedWorkerForRoute] = useState<string | undefined>(undefined);
  const [activeShiftCount, setActiveShiftCount] = useState<number>(0);

  // Lone Worker Safety Monitor Modal State
  const [showSafetyMonitorModal, setShowSafetyMonitorModal] = useState<boolean>(false);
  const [activePanicCount, setActivePanicCount] = useState<number>(0);

  useEffect(() => {
    if (profile?.tenantId) {
      const active = breadcrumbService.getActiveShiftWorkers(profile.tenantId);
      setActiveShiftCount(active.length);
      const panics = safetyCheckInService.getActivePanicAlerts(profile.tenantId);
      setActivePanicCount(panics.length);
    }
  }, [profile?.tenantId, attendanceMap]);
  const [leaveDurationDays, setLeaveDurationDays] = useState(1);
  const [leaveFieldNotes, setLeaveFieldNotes] = useState('');

  // Voice Search Dictation for Attendance Filter
  const { 
    isListening: isSearchListening, 
    startListening: startSearchListening, 
    stopListening: stopSearchListening 
  } = useVoiceDictation({
    onResult: (text) => setSearchTerm(text),
  });

  // Subscribe to offline queue changes to reflect real-time sync states on worker cards
  useEffect(() => {
    const unsubscribe = syncService.subscribe((items) => {
      setAttendanceMap(prev => {
        const next = { ...prev };
        let changed = false;
        items.forEach(item => {
          if (item.entityType === 'ATTENDANCE' && next[item.workerId]) {
            if (next[item.workerId].syncStatus !== item.syncStatus) {
              next[item.workerId] = {
                ...next[item.workerId],
                syncStatus: item.syncStatus,
                offlineTimestamp: item.offlineTimestamp
              };
              changed = true;
            }
          }
        });
        return changed ? next : prev;
      });
    });
    return () => unsubscribe();
  }, []);

  // Load punch conflicts count and listen to resolution changes
  useEffect(() => {
    const loadConflictsCount = async () => {
      if (profile?.tenantId) {
        const list = await conflictService.getConflicts(profile.tenantId);
        setUnresolvedConflictsCount(list.filter(c => c.status === 'UNRESOLVED').length);
      }
    };
    loadConflictsCount();
    window.addEventListener('punchConflictsChanged', loadConflictsCount);
    return () => window.removeEventListener('punchConflictsChanged', loadConflictsCount);
  }, [profile?.tenantId]);

  // Track offline status for the UI
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const loadData = async () => {
      if (profile?.tenantId) {
        try {
          const branchOpt = branchScope.isBranchScoped && branchScope.primaryBranchId
            ? { branchId: branchScope.primaryBranchId }
            : undefined;
          const [fetchedWorkers, fetchedAttendance, fetchedSettings, fetchedAdvances, fetchedHistory] = await Promise.all([
            dbService.getWorkers(profile.tenantId, branchOpt),
            dbService.getTodayAttendance(profile.tenantId, branchOpt),
            dbService.getOrgSettings(profile.tenantId),
            dbService.getAdvances(profile.tenantId),
            dbService.getAttendanceHistory(profile.tenantId, branchOpt)
          ]);
          
          setWorkers(fetchedWorkers);
          setSettings(fetchedSettings);
          setAllAdvances(fetchedAdvances);
          setAllAttendanceHistory(fetchedHistory);
          
          const map: Record<string, AttendanceRecord> = {};
          fetchedAttendance.forEach(r => {
             map[r.workerId] = r;
          });
          setAttendanceMap(map);

          // Default selected quick clock-in worker to first available worker
          if (fetchedWorkers.length > 0) {
            setSelectedQuickWorkerId(fetchedWorkers[0].id);
          }
        } catch (e) {
          console.error("Offline or Error fetching data", e);
        } finally {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, [profile, branchScope.isBranchScoped, branchScope.primaryBranchId]);

  const handlePunch = async (worker: Worker, type: 'IN' | 'OUT') => {
    if (!profile?.tenantId || isScreenLockedForWipe) return;
    
    // Frontline glove feedback: crisp haptic confirmation pulse immediately on tap
    triggerFrontlineHaptic('confirm');
    setActionLoading(worker.id);

    try {
        let currentLocation: { lat: number; lng: number } | undefined;
        let isOutOfGeofence = false;

        if (navigator.geolocation) {
            try {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
                });
                currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                
                if (settings.baseLocation) {
                    const dist = geoUtils.getDistanceInMeters(
                        currentLocation.lat, currentLocation.lng,
                        settings.baseLocation.lat, settings.baseLocation.lng
                    );
                    isOutOfGeofence = dist > settings.baseLocation.radius;
                }
            } catch (err) {
                console.warn("Could not get location", err);
            }
        }

        const todayDate = new Date().toISOString().split('T')[0];
        const recordId = `${profile.tenantId}_${worker.id}_${todayDate}`;
        const now = new Date();
        const existingRecord = attendanceMap[worker.id];

        if (type === 'IN' && existingRecord?.status === 'ON_LEAVE' && existingRecord.leaveInfo?.isPaid) {
            const rawType = existingRecord.leaveInfo.type.toLowerCase();
            
            if (rawType !== 'lwp' && worker.leaveBalances) {
                const lType = rawType as 'cl' | 'sl' | 'pl';
                const currentBal = worker.leaveBalances[lType] ?? 0;
                const updatedBalances = { ...worker.leaveBalances, [lType]: currentBal + 1 };
                
                try {
                    await dbService.updateWorker(worker.id, { leaveBalances: updatedBalances });
                    await dbService.addNotification({
                        tenantId: profile.tenantId, 
                        title: "Leave Automatically Cancelled",
                        message: `${worker.name} punched in today, cancelling their scheduled ${lType.toUpperCase()} leave. 1 day refunded to balance.`,
                        type: 'INFO', 
                        createdAt: new Date().toISOString(), 
                        read: false
                    });
                } catch(e) {
                    console.warn("Offline: Could not refund leave balance to server, but proceeding with punch.");
                }
                
                setWorkers(prev => prev.map(w => w.id === worker.id ? { ...w, leaveBalances: updatedBalances } : w));
            }
        }

        const currentTimeline = existingRecord?.timeline || [];
        
        const newPunch = {
            timestamp: now.toISOString(),
            type: type,
            device: 'Mobile App (Admin Frontline)',
            location: currentLocation,
            isOutOfGeofence
        };

        const newTimeline = [...currentTimeline, newPunch];
        const shift = settings.shifts.find(s => s.id === worker.shiftId) || settings.shifts[0];
        
        let lateCount = 0;
        try { 
            lateCount = await dbService.getMonthlyLateCount(profile.tenantId, worker.id);
        } catch (e) { 
            console.warn("Offline: Could not fetch late count");
        }

        const resolvedBranchId = worker.branchId || branchScope.primaryBranchId || 'default';
        const baseRecord: AttendanceRecord = existingRecord ? {
            ...existingRecord,
            branchId: existingRecord.branchId || resolvedBranchId,
        } : {
            id: recordId,
            tenantId: profile.tenantId,
            branchId: resolvedBranchId,
            workerId: worker.id,
            workerName: worker.name,
            date: todayDate,
            shiftId: worker.shiftId || 'default',
            timeline: [],
            status: 'ABSENT',
            lateStatus: { isLate: false, lateByMins: 0, penaltyApplied: false },
            hours: { gross: 0, net: 0, overtime: 0 }
        };

        baseRecord.timeline = newTimeline;
        
        if (baseRecord.leaveInfo) {
            delete baseRecord.leaveInfo;
        }

        const finalRecord = attendanceLogic.processDailyStatus(
            baseRecord, 
            shift, 
            lateCount, 
            settings.enableBreakTracking,
            worker,
            settings
        );

        let isOfflinePunch = false;
        if (!navigator.onLine) {
            isOfflinePunch = true;
            finalRecord.syncStatus = 'PENDING_LOCAL';
            finalRecord.offlineTimestamp = now.toISOString();
            await syncService.savePunchOffline(finalRecord);
            setAttendanceMap(prev => ({ ...prev, [worker.id]: finalRecord }));
        } else {
            try {
                finalRecord.syncStatus = 'SYNCING';
                setAttendanceMap(prev => ({ ...prev, [worker.id]: finalRecord }));
                await dbService.markAttendance(finalRecord);
                finalRecord.syncStatus = 'SYNCED';
                setAttendanceMap(prev => ({ ...prev, [worker.id]: finalRecord }));
            } catch (dbError) {
                console.warn("Network unreachable. Queuing manual punch offline...");
                isOfflinePunch = true;
                finalRecord.syncStatus = 'PENDING_LOCAL';
                finalRecord.offlineTimestamp = now.toISOString();
                await syncService.savePunchOffline(finalRecord);
                setAttendanceMap(prev => ({ ...prev, [worker.id]: finalRecord }));
            }
        }

        if (isOutOfGeofence) {
            try {
                await dbService.addNotification({
                    tenantId: profile.tenantId,
                    title: 'Geofence Violation Alert',
                    message: `${worker.name} punched ${type} outside the allowed factory radius.`,
                    type: 'WARNING',
                    createdAt: new Date().toISOString(),
                    read: false
                });
            } catch(e) { console.warn("Offline: Geofence notification not sent"); }
            
            if (!isOfflinePunch) {
                toast.warning(`Punch recorded outside the ${settings.baseLocation?.radius || 100}m factory radius`);
            }
        }

        if (finalRecord.lateStatus.isLate && !existingRecord?.lateStatus?.isLate) {
            try {
                await dbService.addNotification({
                    tenantId: profile.tenantId,
                    title: 'Late Arrival',
                    message: `${worker.name} checked in late today.`,
                    type: 'INFO',
                    createdAt: new Date().toISOString(),
                    read: false
                });
            } catch(e) {}
        }

        if (isOfflinePunch) {
            toast.info(`Queued offline: ${worker.name} punched ${type}. Syncs automatically.`);
        } else {
            toast.success(`${worker.name}: Punched ${type} successfully`);
        }
    } catch (e) {
        console.error("Punch Error", e);
        triggerFrontlineHaptic('alert');
        toast.error("Failed to process punch. Please verify network status.");
    } finally {
        setActionLoading(null);
    }
  };

  const markOnLeave = async (worker: Worker) => {
      if (!profile?.tenantId || isScreenLockedForWipe) return;
      triggerFrontlineHaptic('light');

      const todayDate = new Date().toISOString().split('T')[0];
      const recordId = `${profile.tenantId}_${worker.id}_${todayDate}`;

      const leaveRecord: AttendanceRecord = {
          id: recordId,
          tenantId: profile.tenantId,
          branchId: worker.branchId || branchScope.primaryBranchId || 'default',
          workerId: worker.id,
          workerName: worker.name,
          date: todayDate,
          shiftId: worker.shiftId || 'default',
          timeline: [], 
          status: 'ON_LEAVE',
          lateStatus: { isLate: false, lateByMins: 0, penaltyApplied: false },
          hours: { gross: 0, net: 0, overtime: 0 },
          leaveInfo: { 
             type: 'LWP', 
             isPaid: false, 
             reason: 'Quick Action (Admin)'
          }
      };

      try {
          await dbService.markAttendance(leaveRecord);
          toast.success(`Marked ${worker.name} as On Leave (LWP)`);
      } catch (error) {
          console.warn("Network unreachable. Queuing leave offline...");
          await syncService.savePunchOffline(leaveRecord);
          toast.info(`Queued offline: Marked ${worker.name} on Leave`);
      }

      setAttendanceMap(prev => ({ ...prev, [worker.id]: leaveRecord }));
  };

  const toggleExpand = (workerId: string) => {
      setExpandedLogs(prev => {
          const next = new Set(prev);
          if (next.has(workerId)) next.delete(workerId);
          else next.add(workerId);
          return next;
      });
  };

  // Clean Skeleton Loading State
  if (loading) {
    return (
      <div className="space-y-6 pb-24 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 bg-slate-200 rounded-lg w-52" />
            <div className="h-4 bg-slate-100 rounded-lg w-40" />
          </div>
          <div className="h-14 bg-slate-200 rounded-xl w-48" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
              <div className="h-3 bg-slate-200 rounded w-20" />
              <div className="h-7 bg-slate-200 rounded w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Filter workers
  const filteredWorkers = workers.filter(worker => {
    const matchesSearch = worker.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          worker.phone.includes(searchTerm) ||
                          (worker.designation && worker.designation.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (!matchesSearch) return false;

    if (selectedDeptFilter !== 'ALL') {
      const designation = (worker.designation || '').toLowerCase();
      const dept = selectedDeptFilter.toLowerCase();
      if (!designation.includes(dept)) return false;
    }

    const record = attendanceMap[worker.id];
    const sortedTimeline = [...(record?.timeline || [])].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const lastPunch = sortedTimeline[sortedTimeline.length - 1];
    const isInside = lastPunch?.type === 'IN';
    const isOnLeave = record?.status === 'ON_LEAVE';

    if (filterTab === 'ACTIVE') return isInside;
    if (filterTab === 'COMPLETED') return record?.status === 'PRESENT' || record?.status === 'HALF_DAY';
    if (filterTab === 'LEAVE') return isOnLeave;
    if (filterTab === 'ABSENT') return !isInside && (!record || record.status === 'ABSENT');

    return true;
  });

  // Calculate live counts
  let activeInsideCount = 0;
  let presentCompletedCount = 0;
  let leaveCount = 0;
  let notStartedCount = 0;

  workers.forEach(w => {
    const r = attendanceMap[w.id];
    const timeline = r?.timeline || [];
    const lastP = timeline[timeline.length - 1];
    if (lastP?.type === 'IN') activeInsideCount++;
    else if (r?.status === 'PRESENT' || r?.status === 'HALF_DAY') presentCompletedCount++;
    else if (r?.status === 'ON_LEAVE') leaveCount++;
    else notStartedCount++;
  });

  // Quick clock worker selected for the 72px thumb zone confirmation bar
  const quickWorker = workers.find(w => w.id === selectedQuickWorkerId) || workers[0];
  const quickRecord = quickWorker ? attendanceMap[quickWorker.id] : undefined;
  const quickTimeline = [...(quickRecord?.timeline || [])].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const quickLastPunch = quickTimeline[quickTimeline.length - 1];
  const isQuickWorkerInside = quickLastPunch?.type === 'IN';

  return (
    <div className="space-y-6 pb-40 relative">
      {/* Frontline Rain / Moisture Wipe Mode Overlay & Corner Trigger */}
      <FrontlineWipeOverlay 
        onLockChange={setIsScreenLockedForWipe} 
        corner="top-right" 
        showCornerTrigger={true}
      />

      {/* Frontline Ergonomics & Touch Target Modal (Auditing across 3 Viewport Sizes) */}
      <FrontlineErgonomicsModal
        isOpen={isErgonomicsModalOpen}
        onClose={() => setIsErgonomicsModalOpen(false)}
        activeScreenName="Attendance Screen"
        isAuditOverlayActive={isAuditOverlayActive}
        onToggleAuditOverlay={() => setIsAuditOverlayActive(!isAuditOverlayActive)}
        isThumbReachMode={isThumbReachMode}
        onToggleThumbReachMode={() => setIsThumbReachMode(!isThumbReachMode)}
      />

      {/* TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            <h1 className="text-fluid-xl font-bold tracking-tight text-slate-900 break-words">Attendance Register</h1>
            {isOffline && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 text-fluid-xs font-semibold rounded-md border border-amber-200 shrink-0" title="Offline Mode Active">
                <WifiOff size={13} className="shrink-0" /> Offline Cache
              </span>
            )}
          </div>
          <div className="text-fluid-xs text-slate-500 flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
            <span>Frontline Glove-Safe Touch Standards (≥56px &amp; 72px Clock Confirm)</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-600">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          </div>
        </div>

        {/* Supervisor Controls & Sunlight Field Mode Trigger (min-h-[56px] for gloves) */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Field Shift Routes & Breadcrumbs Modal Trigger (Key AC 6) */}
          <button
            onClick={() => {
              triggerFrontlineHaptic('light');
              setShowShiftRouteModal(true);
            }}
            type="button"
            className="min-h-[56px] px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-bold text-xs border-2 border-slate-900 shadow-md flex items-center gap-2.5 transition-all cursor-pointer"
            title="Inspect worker shift routes, breadcrumbs, and live GPS positions"
            aria-label="Open Shift-Scoped Field Routes"
          >
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Navigation size={18} />
            </div>
            <div className="text-left">
              <div className="leading-tight flex items-center gap-1.5">
                <span>Field Routes</span>
                {activeShiftCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>
              <span className="text-[10px] text-slate-300 font-mono block mt-0.5">
                {activeShiftCount > 0 ? `${activeShiftCount} Active Shifts` : 'Route Playback'}
              </span>
            </div>
          </button>

          {/* Lone Worker Safety Command Modal Trigger */}
          <button
            onClick={() => {
              triggerFrontlineHaptic('light');
              setShowSafetyMonitorModal(true);
            }}
            type="button"
            className={`min-h-[56px] px-4 py-2.5 rounded-2xl font-bold text-xs border-2 shadow-md flex items-center gap-2.5 transition-all cursor-pointer ${
              activePanicCount > 0
                ? 'bg-rose-700 hover:bg-rose-800 text-white border-rose-500 animate-pulse'
                : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900'
            }`}
            title="Inspect lone worker check-in statuses, escalation ladder, and panic alerts"
            aria-label="Open Lone Worker Safety Command"
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              activePanicCount > 0 ? 'bg-white text-rose-700' : 'bg-rose-600 text-white'
            }`}>
              <ShieldAlert size={18} />
            </div>
            <div className="text-left">
              <div className="leading-tight flex items-center gap-1.5">
                <span>Lone Safety</span>
                {activePanicCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-black bg-rose-500 text-white animate-bounce">
                    {activePanicCount} SOS
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-300 font-mono block mt-0.5">
                Check-Ins & SOS
              </span>
            </div>
          </button>

          {/* Quick-Access Field Mode (Sunlight Mode) Toggle */}
          <button
            onClick={() => {
              triggerFrontlineHaptic('confirm');
              toggleFieldMode();
              if (!isFieldMode) {
                toast.success("High-Contrast Field Mode Activated (Sunlight Legibility >= 7:1)");
              } else {
                toast.info("Standard Platform Theme Restored");
              }
            }}
            type="button"
            className={`min-h-[56px] px-4 py-2.5 rounded-2xl font-black text-xs border-2 shadow-xs flex items-center gap-2.5 transition-all cursor-pointer ${
              isFieldMode
                ? 'bg-black text-white border-black ring-2 ring-amber-400'
                : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
            }`}
            title={isFieldMode ? 'Sunlight Field Mode ON (7:1 Contrast, 16px+ Type). Tap to disable.' : 'Switch to High-Contrast Field Mode for sunlight readability'}
            aria-pressed={isFieldMode}
            aria-label="Toggle Sunlight Field Mode"
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isFieldMode ? 'bg-amber-400 text-black' : 'bg-amber-50 text-amber-600'}`}>
              <Sun size={20} strokeWidth={isFieldMode ? 2.5 : 2} />
            </div>
            <div className="text-left">
              <div className="leading-tight flex items-center gap-1.5">
                <span className="font-black">{isFieldMode ? 'Field Mode (ON)' : 'Field Mode'}</span>
                <span className={`w-2 h-2 rounded-full ${isFieldMode ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'}`} />
              </div>
              <span className={`text-[10px] font-mono font-medium block mt-0.5 ${isFieldMode ? 'text-amber-200' : 'text-slate-500'}`}>
                {isFieldMode ? 'Sunlight High-Contrast' : 'Sunlight Optimized'}
              </span>
            </div>
          </button>

          {/* Automated Accessibility (axe-core) Audit Trigger */}
          <button
            onClick={() => {
              triggerFrontlineHaptic('light');
              setA11yModalOpen(true);
            }}
            type="button"
            className="min-h-[56px] px-3.5 py-2.5 rounded-2xl bg-white hover:bg-slate-50 active:scale-95 text-slate-800 font-bold text-xs border-2 border-slate-300 hover:border-blue-500 shadow-xs flex items-center gap-2 transition-all cursor-pointer"
            title="Open Automated Accessibility (axe-core) & Contrast Report"
            aria-label="Run Accessibility Audit"
          >
            <ShieldCheck size={18} className="text-blue-600" />
            <div className="text-left">
              <div className="leading-tight flex items-center gap-1">
                <span>A11y Audit</span>
                <span className="w-2 h-2 rounded-full bg-blue-500" />
              </div>
              <span className="text-[10px] text-slate-500 font-mono font-normal">axe-core zero errors</span>
            </div>
          </button>

          {/* Punch Conflict Resolver Button */}
          <button
            onClick={() => {
              triggerFrontlineHaptic('light');
              setIsConflictModalOpen(true);
            }}
            type="button"
            className={`min-h-[56px] px-3.5 py-2.5 rounded-2xl font-bold text-xs border-2 shadow-xs flex items-center gap-2.5 transition-all cursor-pointer ${
              unresolvedConflictsCount > 0
                ? 'bg-purple-50 hover:bg-purple-100 text-purple-950 border-purple-400 ring-2 ring-purple-300/40'
                : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
            }`}
            title="Attendance Punch Conflict Resolution Screen"
          >
            <GitMerge size={18} className={unresolvedConflictsCount > 0 ? 'text-purple-600' : 'text-slate-600'} />
            <div className="text-left">
              <div className="leading-tight flex items-center gap-1.5">
                <span>Conflicts</span>
                {unresolvedConflictsCount > 0 ? (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-mono font-black animate-pulse">
                    {unresolvedConflictsCount}
                  </span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                )}
              </div>
              <span className="text-[10px] text-slate-500 font-mono font-normal">
                {unresolvedConflictsCount > 0 ? 'Review Needed' : '0 Conflicts'}
              </span>
            </div>
          </button>

          {/* Frontline Audit Button */}
          <button
            onClick={() => setIsErgonomicsModalOpen(true)}
            type="button"
            className="min-h-[56px] px-3.5 py-2.5 rounded-2xl bg-white hover:bg-slate-50 active:scale-95 text-slate-800 font-bold text-xs border-2 border-slate-300 hover:border-emerald-500 shadow-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <ShieldCheck size={18} className="text-emerald-600" />
            <div className="text-left">
              <div className="leading-tight flex items-center gap-1">
                <span>Touch Audit</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <span className="text-[10px] text-slate-500 font-mono font-normal">56px & 72px Safe</span>
            </div>
          </button>

          {/* Quick-Access Earned Wage Access (EWA) Control */}
          <button
            onClick={() => {
              triggerFrontlineHaptic('light');
              const target = workers.find(w => w.id === selectedQuickWorkerId) || workers[0];
              if (target) setEwaModalWorker(target);
            }}
            type="button"
            className="min-h-[56px] px-3.5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs border-2 border-emerald-500 shadow-xs flex items-center gap-2 transition-all cursor-pointer"
            title="Earned Wage Access (EWA) Quick Modal"
          >
            <IndianRupee size={18} />
            <div className="text-left">
              <div className="leading-tight flex items-center gap-1">
                <span>Accrued Wages</span>
                <span className="w-2 h-2 rounded-full bg-emerald-300" />
              </div>
              <span className="text-[10px] text-emerald-100 font-mono font-normal">EWA Withdrawal</span>
            </div>
          </button>
        </div>
      </div>

      {/* METRIC STRIP (Tabular figures) */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1 sm:pb-0 text-xs font-mono tabular-nums">
        {branchScope.isBranchScoped && (
          <div className="bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-200 shadow-xs flex items-center gap-2 shrink-0 text-emerald-900 font-sans">
            <MapPin size={14} className="text-emerald-600 shrink-0" />
            <span className="text-[11px] font-bold">Branch Scope: {branchScope.branchName}</span>
          </div>
        )}
        <div className="bg-white px-4 py-2 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-2.5 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-slate-500 text-[11px] font-sans">On Floor:</span>
          <span className="font-bold text-slate-900 text-sm">{activeInsideCount}</span>
        </div>
        <div className="bg-white px-4 py-2 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-2.5 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <span className="text-slate-500 text-[11px] font-sans">Finished:</span>
          <span className="font-bold text-slate-900 text-sm">{presentCompletedCount}</span>
        </div>
        <div className="bg-white px-4 py-2 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-2.5 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span className="text-slate-500 text-[11px] font-sans">Pending:</span>
          <span className="font-bold text-slate-900 text-sm">{notStartedCount}</span>
        </div>
      </div>

      {/* CONSTRAINED SEARCH & OPTION CONTROLS (Voice Dictation + Predefined Chips + Barcode Keypad) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Box with Native Speech Dictation Button */}
          <div className="flex-1 relative flex items-center">
            <input 
              type="text" 
              placeholder="Search or voice dictate worker name / phone..." 
              style={{ fontSize: '16px' }}
              className="w-full min-h-[56px] pl-4 pr-28 py-3 bg-white border-2 border-slate-200 rounded-2xl text-slate-800 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all shadow-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            
            {/* Voice Dictation Button inside Search Box (>= 48px target) */}
            <div className="absolute right-2 flex items-center gap-1.5">
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  triggerFrontlineHaptic('light');
                  if (isSearchListening) stopSearchListening();
                  else startSearchListening();
                }}
                className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition-all cursor-pointer border ${
                  isSearchListening
                    ? 'bg-rose-600 text-white border-rose-500 animate-pulse'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                }`}
                title={isSearchListening ? 'Listening... Speak worker name' : 'Voice search (Native Speech Recognizer)'}
              >
                {isSearchListening ? <MicOff size={18} /> : <Mic size={18} className="text-blue-600" />}
              </button>
            </div>
          </div>

          {/* Barcode Unreadable / Manual Numeric Keypad Fallback Button (AC: Edge Case) */}
          <button
            type="button"
            onClick={() => {
              triggerFrontlineHaptic('light');
              setIsNumericKeypadOpen(true);
            }}
            className="min-h-[56px] px-4 py-2.5 rounded-2xl bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-900 font-extrabold text-xs border-2 border-amber-300 shadow-xs flex items-center gap-2 cursor-pointer shrink-0"
            title="Barcode worn or unreadable? Tap for large numeric badge keypad"
          >
            <QrCode size={20} className="text-amber-700" />
            <div className="text-left">
              <span className="block font-black">Badge Keypad</span>
              <span className="text-[10px] text-amber-700 font-mono font-normal">Worn Barcode Fallback</span>
            </div>
          </button>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-200/80 rounded-2xl shrink-0 overflow-x-auto min-h-[56px]">
            {[
              { id: 'ALL', label: 'All Staff' },
              { id: 'ACTIVE', label: `On Floor (${activeInsideCount})` },
              { id: 'COMPLETED', label: `Done (${presentCompletedCount})` },
              { id: 'ABSENT', label: 'Not In' },
              { id: 'LEAVE', label: `Leave (${leaveCount})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  triggerFrontlineHaptic('light');
                  setFilterTab(tab.id as any);
                }}
                className={`min-h-[44px] px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap active:scale-95 cursor-pointer ${
                  filterTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Predefined Department & Role Option Chips (Zero-typing selection) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] font-mono font-bold text-slate-400 shrink-0 uppercase">
            Trade Chips:
          </span>
          {[
            { id: 'ALL', label: 'All Trades' },
            { id: 'machin', label: 'Machinists' },
            { id: 'fab', label: 'Fabricators' },
            { id: 'weld', label: 'Welders' },
            { id: 'assem', label: 'Assembly' },
            { id: 'qc', label: 'Quality' },
            { id: 'pack', label: 'Packaging' }
          ].map(chip => (
            <button
              key={chip.id}
              onClick={() => {
                triggerFrontlineHaptic('light');
                setSelectedDeptFilter(chip.id);
              }}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all shrink-0 cursor-pointer ${
                selectedDeptFilter === chip.id
                  ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                  : 'bg-white text-slate-700 hover:text-slate-900 border-slate-200 hover:border-slate-300'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* RESPONSIVE ATTENDANCE REGISTER:
          - Desktop (md+): 10-column sticky-header <table> with wrapper-only overflow-x-auto
          - Mobile (< md): Vertical frontline cards showing [Worker Name, Status, Time] + Compact Column Priority view
          - Load More pagination prevents rendering 500+ rows at once on low-end phones */}
      {(() => {
        const getWorkerAttendanceView = (worker: Worker) => {
          const record = attendanceMap[worker.id];
          const sortedTimeline = [...(record?.timeline || [])].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          const lastPunch = sortedTimeline[sortedTimeline.length - 1];
          const firstInPunch = sortedTimeline.find((p) => p.type === 'IN');
          const latestOutPunch = [...sortedTimeline].reverse().find((p) => p.type === 'OUT');
          const isInside = lastPunch?.type === 'IN';
          const isOnLeave = record?.status === 'ON_LEAVE';
          const isExpanded = expandedLogs.has(worker.id);
          const isSelectedForQuickClock = worker.id === selectedQuickWorkerId;

          let statusLabel = 'NOT IN';
          if (isOnLeave) {
            statusLabel = record?.leaveInfo?.isPaid ? 'PAID LEAVE' : 'ON LEAVE';
          } else if (isInside) {
            statusLabel = 'ON FLOOR (INSIDE)';
          } else if (record?.status === 'PRESENT') {
            statusLabel = 'PRESENT (COMPLETED)';
          } else if (record?.status === 'HALF_DAY') {
            statusLabel = 'HALF DAY';
          }

          const firstInFormatted = firstInPunch
            ? new Date(firstInPunch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '--:--';

          const latestOutFormatted = latestOutPunch
            ? new Date(latestOutPunch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : isInside
            ? 'Inside Floor'
            : '--:--';

          const overtimeHours = Math.max(0, (record?.hours?.overtime ?? 0));
          const hasOutOfGeofence = sortedTimeline.some((p) => p.isOutOfGeofence);

          return {
            record,
            sortedTimeline,
            lastPunch,
            firstInFormatted,
            latestOutFormatted,
            isInside,
            isOnLeave,
            isExpanded,
            isSelectedForQuickClock,
            statusLabel,
            overtimeHours,
            hasOutOfGeofence,
          };
        };

        const attendanceColumns: ResponsiveColumn<Worker>[] = [
          {
            key: 'worker',
            header: 'Worker',
            mobileLabel: 'Worker Name',
            stickyLeft: true,
            isPrimary: true,
            mobilePriority: true,
            minWidth: 'min-w-[190px]',
            render: (worker) => {
              const { record, isInside, isSelectedForQuickClock, statusLabel } =
                getWorkerAttendanceView(worker);
              return (
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs text-white shrink-0 overflow-hidden ${
                      isInside ? 'bg-emerald-600' : 'bg-slate-700'
                    }`}
                  >
                    {worker.photoUrl ? (
                      <img
                        src={worker.photoUrl}
                        alt={worker.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span>{worker.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <TruncatedText
                        text={worker.name}
                        modalTitle="Worker Attendance Details"
                        subtitle={worker.designation || 'Worker'}
                        details={[
                          { label: 'Phone', value: worker.phone || 'Not recorded', mono: true },
                          { label: 'Current Status', value: statusLabel },
                          ...(record
                            ? [{ label: 'Net Hours Today', value: `${record.hours.net.toFixed(1)} hrs`, mono: true }]
                            : []),
                        ]}
                        className="font-bold text-slate-900 text-xs"
                      />
                      {isSelectedForQuickClock && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[9px] font-mono font-bold shrink-0">
                          Dock
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            },
            renderPriority: (worker) => (
              <div className="min-w-0">
                <div className="font-bold text-slate-900 text-fluid-xs truncate">{worker.name}</div>
                <div className="text-[11px] text-slate-500 truncate">{worker.designation || 'Worker'}</div>
              </div>
            ),
          },
          {
            key: 'rolePhone',
            header: 'Role & Phone',
            minWidth: 'min-w-[155px]',
            render: (worker) => (
              <div className="min-w-0">
                <div className="font-medium text-slate-700 truncate max-w-[150px]">
                  {worker.designation || 'Worker'}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500">
                  {worker.phone || '—'}
                </div>
              </div>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            mobilePriority: true,
            minWidth: 'min-w-[140px]',
            render: (worker) => {
              const { record, isOnLeave, isInside, statusLabel } = getWorkerAttendanceView(worker);
              return (
                <FieldStatusBadge
                  status={
                    isOnLeave
                      ? 'ON_LEAVE'
                      : isInside
                      ? 'PENDING'
                      : record?.status || 'ABSENT'
                  }
                  customLabel={statusLabel}
                  isLate={record?.lateStatus?.isLate}
                  lateMinutes={record?.lateStatus?.lateByMins}
                  size="sm"
                  isCriticalMetric={true}
                />
              );
            },
            renderPriority: (worker) => {
              const { isOnLeave, isInside, record } = getWorkerAttendanceView(worker);
              if (isOnLeave) {
                return <span className="text-[11px] font-bold text-indigo-700">Leave</span>;
              }
              if (isInside) {
                return <span className="text-[11px] font-bold text-emerald-700">On Floor</span>;
              }
              if (record?.status === 'PRESENT') {
                return <span className="text-[11px] font-bold text-blue-700">Done</span>;
              }
              if (record?.status === 'HALF_DAY') {
                return <span className="text-[11px] font-bold text-amber-700">Half Day</span>;
              }
              return <span className="text-[11px] font-semibold text-slate-500">Not In</span>;
            },
          },
          {
            key: 'firstIn',
            header: 'First In',
            align: 'center',
            numeric: true,
            minWidth: 'min-w-[90px]',
            render: (worker) => {
              const { firstInFormatted } = getWorkerAttendanceView(worker);
              return (
                <span className="font-semibold text-slate-800">{firstInFormatted}</span>
              );
            },
          },
          {
            key: 'latestOut',
            header: 'Latest Out',
            align: 'center',
            numeric: true,
            minWidth: 'min-w-[105px]',
            render: (worker) => {
              const { latestOutFormatted, isInside } = getWorkerAttendanceView(worker);
              return (
                <span className={isInside ? 'text-emerald-700 font-bold font-sans text-[11px]' : 'font-semibold text-slate-800'}>
                  {latestOutFormatted}
                </span>
              );
            },
          },
          {
            key: 'netHours',
            header: 'Net Hours',
            mobileLabel: 'Time',
            align: 'right',
            numeric: true,
            mobilePriority: true,
            minWidth: 'min-w-[95px]',
            render: (worker) => {
              const { record } = getWorkerAttendanceView(worker);
              return (
                <span className="font-bold text-slate-900">
                  {record ? `${record.hours.net.toFixed(1)}h` : '0.0h'}
                </span>
              );
            },
            renderPriority: (worker) => {
              const { record, firstInFormatted, isInside } = getWorkerAttendanceView(worker);
              return (
                <div className="text-right">
                  <div className="font-bold text-slate-900 text-xs">
                    {record ? `${record.hours.net.toFixed(1)}h` : '--'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {isInside ? `In ${firstInFormatted}` : firstInFormatted !== '--:--' ? firstInFormatted : 'No punch'}
                  </div>
                </div>
              );
            },
          },
          {
            key: 'overtime',
            header: 'Overtime',
            align: 'right',
            numeric: true,
            minWidth: 'min-w-[85px]',
            render: (worker) => {
              const { overtimeHours } = getWorkerAttendanceView(worker);
              return overtimeHours > 0 ? (
                <span className="font-bold text-amber-700">+{overtimeHours.toFixed(1)}h</span>
              ) : (
                <span className="text-slate-400">—</span>
              );
            },
          },
          {
            key: 'punches',
            header: 'Punches / Zone',
            align: 'center',
            minWidth: 'min-w-[115px]',
            render: (worker) => {
              const { sortedTimeline, hasOutOfGeofence } = getWorkerAttendanceView(worker);
              return (
                <div className="inline-flex flex-col items-center gap-0.5">
                  <span className="font-mono tabular-nums text-slate-700 font-semibold">
                    {sortedTimeline.length} {sortedTimeline.length === 1 ? 'punch' : 'punches'}
                  </span>
                  {hasOutOfGeofence && (
                    <span className="text-[10px] text-amber-700 font-semibold inline-flex items-center gap-0.5">
                      <MapPin size={10} /> Out of Zone
                    </span>
                  )}
                </div>
              );
            },
          },
          {
            key: 'syncEwa',
            header: 'Sync & EWA',
            align: 'center',
            minWidth: 'min-w-[125px]',
            render: (worker) => {
              const { record, lastPunch } = getWorkerAttendanceView(worker);
              return (
                <div className="inline-flex items-center justify-center gap-1.5">
                  {record ? (
                    <SyncStatusBadge
                      status={record.syncStatus || 'SYNCED'}
                      offlineTimestamp={record.offlineTimestamp || lastPunch?.offlineTimestamp}
                      size="sm"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-400 font-mono">—</span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerFrontlineHaptic('light');
                      setEwaModalWorker(worker);
                    }}
                    className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[10px] inline-flex items-center gap-0.5 cursor-pointer"
                    title="Access Accrued Wages (EWA)"
                  >
                    <IndianRupee size={10} />
                    <span>EWA</span>
                  </button>
                </div>
              );
            },
          },
          {
            key: 'actions',
            header: 'Quick Punch',
            align: 'right',
            isAction: true,
            minWidth: 'min-w-[215px]',
            render: (worker) => {
              const { isInside } = getWorkerAttendanceView(worker);
              return (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center justify-end gap-1.5"
                >
                  <button
                    type="button"
                    onClick={() => handlePunch(worker, 'IN')}
                    disabled={isInside || actionLoading === worker.id || isScreenLockedForWipe}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer ${
                      isInside
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                    }`}
                  >
                    {actionLoading === worker.id ? (
                      <Loader2 className="animate-spin" size={13} />
                    ) : (
                      <LogIn size={13} />
                    )}
                    <span>In</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePunch(worker, 'OUT')}
                    disabled={!isInside || actionLoading === worker.id || isScreenLockedForWipe}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer ${
                      !isInside
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                    }`}
                  >
                    {actionLoading === worker.id ? (
                      <Loader2 className="animate-spin" size={13} />
                    ) : (
                      <LogOut size={13} />
                    )}
                    <span>Out</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerFrontlineHaptic('light');
                      setLeaveModalWorker(worker);
                      setSelectedLeaveReason('Sick / Medical Leave');
                      setLeaveDurationDays(1);
                      setLeaveFieldNotes('');
                    }}
                    disabled={isScreenLockedForWipe}
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
                    title="Mark Leave"
                    aria-label={`Mark leave for ${worker.name}`}
                  >
                    <Calendar size={14} />
                  </button>
                </div>
              );
            },
          },
        ];

        return (
          <ResponsiveDataTable
            data={filteredWorkers}
            columns={attendanceColumns}
            keyExtractor={(worker) => worker.id}
            loading={loading}
            stickyHeader={true}
            maxHeightClassName="max-h-[66vh]"
            tableMinWidthClassName="min-w-[1220px]"
            paginationMode="loadMore"
            initialPageSize={20}
            itemLabel="workers"
            ariaLabel="Daily workforce attendance register"
            onRowClick={(worker) => setSelectedQuickWorkerId(worker.id)}
            getRowClassName={(worker) =>
              worker.id === selectedQuickWorkerId ? 'bg-blue-50/50 hover:bg-blue-50/80' : ''
            }
            emptyState={{
              icon: <AlertCircle size={24} className="text-slate-400" />,
              title: 'No personnel found for this view',
              description: 'Try switching filter tabs, trade chips, or clearing the search box.',
              action:
                searchTerm || filterTab !== 'ALL' || selectedDeptFilter !== 'ALL' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setFilterTab('ALL');
                      setSelectedDeptFilter('ALL');
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                  >
                    Reset Filters
                  </button>
                ) : undefined,
            }}
            renderMobileCard={(worker) => {
              const {
                record,
                sortedTimeline,
                lastPunch,
                firstInFormatted,
                latestOutFormatted,
                isInside,
                isOnLeave,
                isExpanded,
                isSelectedForQuickClock,
                statusLabel,
              } = getWorkerAttendanceView(worker);

              return (
                <div
                  onClick={() => setSelectedQuickWorkerId(worker.id)}
                  className={`bg-white p-4 sm:p-5 rounded-3xl border-2 transition-all flex flex-col justify-between relative cursor-pointer ${
                    isSelectedForQuickClock
                      ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-md'
                      : 'border-slate-200/90 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  {isAuditOverlayActive && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-blue-600 text-white font-mono text-[9px] font-bold z-10 shadow-xs">
                      56px Targets + 14px Gap
                    </div>
                  )}

                  <div className="min-w-0">
                    {/* MOBILE CARD HEADER: Worker Name + Status + Time Summary */}
                    <div className="flex justify-between items-start gap-2.5 flex-wrap xs:flex-nowrap min-w-0">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-fluid-base text-white shrink-0 overflow-hidden relative shadow-xs ${
                            isInside ? 'bg-emerald-600 border-2 border-emerald-400' : 'bg-slate-700 border-2 border-slate-500'
                          }`}
                        >
                          {worker.photoUrl ? (
                            <img
                              src={worker.photoUrl}
                              alt={worker.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <span>{worker.name.charAt(0)}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="min-w-0 flex-1">
                              <TruncatedText
                                text={worker.name}
                                modalTitle="Worker Attendance Details"
                                subtitle={worker.designation || 'Worker'}
                                details={[
                                  { label: 'Phone', value: worker.phone || 'Not recorded', mono: true },
                                  { label: 'Current Status', value: statusLabel },
                                  ...(record
                                    ? [{ label: 'Net Hours Today', value: `${record.hours.net.toFixed(1)} hrs`, mono: true }]
                                    : []),
                                ]}
                                className="font-extrabold text-fluid-base text-slate-900"
                              />
                            </div>
                            {isSelectedForQuickClock && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-mono font-bold shrink-0">
                                Quick Dock
                              </span>
                            )}
                          </div>
                          <div className="text-fluid-xs text-slate-500 flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-0.5 min-w-0">
                            <span className="font-medium truncate max-w-full">{worker.designation || 'Worker'}</span>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span className="font-mono tabular-nums break-all [overflow-wrap:anywhere]">{worker.phone}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0 ml-auto">
                        <div className="flex items-center flex-wrap justify-end gap-1.5">
                          <FieldStatusBadge
                            status={
                              isOnLeave
                                ? 'ON_LEAVE'
                                : isInside
                                ? 'PENDING'
                                : record?.status || 'ABSENT'
                            }
                            customLabel={statusLabel}
                            isLate={record?.lateStatus?.isLate}
                            lateMinutes={record?.lateStatus?.lateByMins}
                            size="md"
                            isCriticalMetric={true}
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerFrontlineHaptic('light');
                              setEwaModalWorker(worker);
                            }}
                            className="min-h-[1.75rem] px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-800 border border-emerald-300 font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer shrink-0"
                            title="Access Accrued Wages (EWA)"
                          >
                            <IndianRupee size={11} className="text-emerald-700 shrink-0" />
                            <span>EWA</span>
                          </button>
                        </div>
                        {record && (
                          <SyncStatusBadge
                            status={record.syncStatus || 'SYNCED'}
                            offlineTimestamp={record.offlineTimestamp || lastPunch?.offlineTimestamp}
                            size="sm"
                          />
                        )}
                      </div>
                    </div>

                    {/* STACKED KEY-VALUE TIME SUMMARY [First In | Latest Out | Net Time] */}
                    <div className="bg-slate-50 p-3.5 rounded-2xl text-xs mt-3.5 border border-slate-100">
                      <div
                        className={`flex justify-between items-center text-slate-700 font-bold cursor-pointer ${
                          isExpanded && sortedTimeline.length > 0 ? 'border-b border-slate-200 pb-2 mb-2' : ''
                        }`}
                        onClick={(e) => {
                          if (sortedTimeline.length === 0) return;
                          e.stopPropagation();
                          toggleExpand(worker.id);
                        }}
                      >
                        <div className="flex items-center gap-2 font-mono tabular-nums">
                          <span className="font-bold text-slate-900">
                            Time: {record ? `${record.hours.net.toFixed(1)} hrs` : '0.0 hrs'}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            · {sortedTimeline.length} punches
                          </span>
                        </div>
                        {sortedTimeline.length > 0 && (
                          <div className="flex items-center text-blue-600 text-xs">
                            <span className="mr-1 text-[11px]">{isExpanded ? 'Hide' : 'Timeline'}</span>
                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </div>
                        )}
                      </div>

                      {!isExpanded || sortedTimeline.length === 0 ? (
                        <div className="flex justify-between items-center text-slate-600 mt-2 font-mono tabular-nums text-xs">
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 block font-sans">First In</span>
                            <span className="font-bold text-slate-800">{firstInFormatted}</span>
                          </div>
                          <ArrowRight size={14} className="text-slate-300" />
                          <div className="text-right">
                            <span className="text-[10px] uppercase text-slate-400 block font-sans">Latest Out</span>
                            <span className={isInside ? 'text-emerald-700 font-bold font-sans' : 'font-bold text-slate-800'}>
                              {latestOutFormatted}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5 mt-2 max-h-48 overflow-y-auto">
                          {sortedTimeline.map((punch, idx) => {
                            const isRegulated =
                              punch.device === 'MANUAL_OVERRIDE_BY_ADMIN' || punch.device.includes('Admin');
                            return (
                              <div
                                key={idx}
                                className="flex justify-between items-center text-slate-600 bg-white p-2.5 rounded-xl border border-slate-100 text-xs font-mono tabular-nums"
                              >
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={`w-2.5 h-2.5 rounded-full ${
                                      punch.type === 'IN' ? 'bg-emerald-500' : 'bg-rose-500'
                                    }`}
                                  />
                                  <span className="font-bold font-sans uppercase text-[11px]">{punch.type}</span>
                                  {isRegulated && <span className="text-[10px] text-blue-600 font-sans">· Admin</span>}
                                  {punch.isOutOfGeofence && (
                                    <span className="text-[10px] text-amber-600 font-sans flex items-center gap-0.5">
                                      <MapPin size={10} /> Out of Zone
                                    </span>
                                  )}
                                  {punch.isSupervisorOverridden && (
                                    <span
                                      className="text-[10px] text-indigo-600 font-sans flex items-center gap-0.5 bg-indigo-50 px-1 py-0.5 rounded font-bold"
                                      title="Supervisor In-Person Override"
                                    >
                                      <ShieldCheck size={10} /> Override
                                    </span>
                                  )}
                                </div>
                                <span className="font-bold text-slate-800">
                                  {new Date(punch.timestamp).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* FRONTLINE ACTIONS STRIP (≥56px Minimum Touch Target) */}
                  <div className="flex flex-wrap sm:grid sm:grid-cols-5 gap-2.5 sm:gap-3 mt-4 pt-3.5 border-t border-slate-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePunch(worker, 'IN');
                      }}
                      disabled={isInside || actionLoading === worker.id || isScreenLockedForWipe}
                      className={`flex-1 min-w-[7.5rem] sm:min-w-0 sm:col-span-2 min-h-[3.5rem] flex items-center justify-center px-3 py-2.5 rounded-2xl text-fluid-sm font-black transition-all active:scale-95 cursor-pointer border-2 ${
                        isInside
                          ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-md active:bg-emerald-800'
                      }`}
                      title="Punch In (Frontline safe 56px touch target)"
                    >
                      {actionLoading === worker.id ? (
                        <Loader2 className="animate-spin" size={20} />
                      ) : (
                        <span className="flex items-center gap-1.5 font-bold uppercase tracking-wide min-w-0">
                          <LogIn size={18} strokeWidth={2.5} className="shrink-0" />
                          <span className="truncate">Check In</span>
                        </span>
                      )}
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePunch(worker, 'OUT');
                      }}
                      disabled={!isInside || actionLoading === worker.id || isScreenLockedForWipe}
                      className={`flex-1 min-w-[7.5rem] sm:min-w-0 sm:col-span-2 min-h-[3.5rem] flex items-center justify-center px-3 py-2.5 rounded-2xl text-fluid-sm font-black transition-all active:scale-95 cursor-pointer border-2 ${
                        !isInside
                          ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                          : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-500 shadow-md active:bg-rose-800'
                      }`}
                      title="Punch Out (Frontline safe 56px touch target)"
                    >
                      {actionLoading === worker.id ? (
                        <Loader2 className="animate-spin" size={20} />
                      ) : (
                        <span className="flex items-center gap-1.5 font-bold uppercase tracking-wide min-w-0">
                          <LogOut size={18} strokeWidth={2.5} className="shrink-0" />
                          <span className="truncate">Check Out</span>
                        </span>
                      )}
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerFrontlineHaptic('light');
                        setLeaveModalWorker(worker);
                        setSelectedLeaveReason('Sick / Medical Leave');
                        setLeaveDurationDays(1);
                        setLeaveFieldNotes('');
                      }}
                      disabled={isScreenLockedForWipe}
                      className="sm:col-span-1 min-h-[3.5rem] min-w-[3.5rem] flex-none flex items-center justify-center rounded-2xl text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border-2 border-slate-300 transition-colors active:scale-95 cursor-pointer shadow-xs"
                      title="Constrained Leave / Note Entry (No typing)"
                      aria-label={`Mark leave for ${worker.name}`}
                    >
                      <Calendar size={20} strokeWidth={2.2} className="shrink-0" />
                    </button>
                  </div>
                </div>
              );
            }}
          />
        );
      })()}

      {/* ANCHORED FRONTLINE THUMB-ZONE QUICK CLOCK BAR (AC 1, AC 4, AC 6)
          - Anchored in the bottom 1/3 of the screen for natural thumb ergonomics
          - High-frequency punch button is ≥ 72px in height
          - One-handed thumb sweep toggle aligns button to bottom-right for occupied hands
          - Single tap confirms immediately with haptic vibration & success toast */}
      {quickWorker && (
        <div className="fixed bottom-0 left-0 right-0 z-30 p-3 sm:p-4 bg-slate-950/95 backdrop-blur-md border-t-2 border-slate-800 shadow-2xl transition-all">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            
            {/* Worker Context in Dock */}
            <div className="flex items-center justify-between w-full sm:w-auto gap-3 text-white">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-base text-white shrink-0 ${isQuickWorkerInside ? 'bg-emerald-600 border-2 border-emerald-400' : 'bg-slate-700 border-2 border-slate-500'}`}>
                  {quickWorker.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">Frontline Thumb Zone:</span>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${isQuickWorkerInside ? 'bg-emerald-900/60 text-emerald-400 border border-emerald-700' : 'bg-slate-800 text-slate-300'}`}>
                      {isQuickWorkerInside ? 'Currently Inside' : 'Currently Outside'}
                    </span>
                    {quickRecord && (
                      <SyncStatusBadge
                        status={quickRecord.syncStatus || 'SYNCED'}
                        offlineTimestamp={quickRecord.offlineTimestamp || quickLastPunch?.offlineTimestamp}
                        size="sm"
                      />
                    )}
                  </div>
                  <h3 className="text-base font-extrabold text-white truncate max-w-[200px] sm:max-w-xs">{quickWorker.name}</h3>
                </div>
              </div>

              {/* Worker Quick Switcher for Site Supervisors */}
              {workers.length > 1 && (
                <div className="sm:hidden">
                  <select
                    value={selectedQuickWorkerId}
                    onChange={(e) => setSelectedQuickWorkerId(e.target.value)}
                    className="bg-slate-800 text-white text-xs font-bold py-2 px-3 rounded-xl border border-slate-700 outline-none"
                  >
                    {workers.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Quick Switcher on Tablets/Desktop */}
            {workers.length > 1 && (
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Switch Staff:</span>
                <select
                  value={selectedQuickWorkerId}
                  onChange={(e) => setSelectedQuickWorkerId(e.target.value)}
                  className="bg-slate-800 text-white text-xs font-bold py-2.5 px-3 rounded-xl border border-slate-700 outline-none hover:border-slate-500 transition-colors"
                >
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.designation || 'Staff'})</option>
                  ))}
                </select>
              </div>
            )}

            {/* HIGH FREQUENCY CONFIRMATION BUTTON: Exactly 72px height, full-width or bottom-right aligned */}
            <div className={`w-full ${isThumbReachMode ? 'sm:w-80 sm:ml-auto' : 'sm:w-96'} relative`}>
              {isAuditOverlayActive && (
                <div className="absolute -top-3 right-2 bg-emerald-400 text-slate-950 font-mono font-black text-[9px] px-2 py-0.5 rounded shadow-sm z-10">
                  72px Thumb Action
                </div>
              )}

              {/* Single Tap Punch IN / Punch OUT Confirmation Button */}
              {!isQuickWorkerInside ? (
                <button
                  onClick={() => handlePunch(quickWorker, 'IN')}
                  disabled={actionLoading === quickWorker.id || isScreenLockedForWipe}
                  type="button"
                  aria-label="Confirm Clock IN for worker"
                  className="w-full min-h-[72px] h-[72px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-lg sm:text-xl tracking-wide uppercase border-4 border-emerald-400 shadow-xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all cursor-pointer"
                >
                  {actionLoading === quickWorker.id ? (
                    <Loader2 className="animate-spin text-white" size={28} />
                  ) : (
                    <>
                      <LogIn size={26} strokeWidth={3} />
                      <span>Punch IN Now</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => handlePunch(quickWorker, 'OUT')}
                  disabled={actionLoading === quickWorker.id || isScreenLockedForWipe}
                  type="button"
                  aria-label="Confirm Clock OUT for worker"
                  className="w-full min-h-[72px] h-[72px] rounded-2xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-lg sm:text-xl tracking-wide uppercase border-4 border-rose-400 shadow-xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all cursor-pointer"
                >
                  {actionLoading === quickWorker.id ? (
                    <Loader2 className="animate-spin text-white" size={28} />
                  ) : (
                    <>
                      <LogOut size={26} strokeWidth={3} />
                      <span>Punch OUT Now</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* NUMERIC BADGE KEYPAD MODAL (Fallback when barcode/QR is worn or unreadable) */}
      <NumericKeypadModal
        isOpen={isNumericKeypadOpen}
        onClose={() => setIsNumericKeypadOpen(false)}
        workers={workers}
        onPunch={(w, type) => handlePunch(w, type)}
      />

      {/* CONSTRAINED LEAVE & FIELD REASON MODAL (No typing needed, chips + stepper + voice) */}
      {leaveModalWorker && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full border-2 border-slate-200 shadow-2xl overflow-hidden my-auto animate-in zoom-in-95">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
                  Frontline Constrained Input
                </span>
                <h3 className="text-lg font-black text-white mt-0.5">Record Leave / Absence</h3>
                <p className="text-xs text-slate-400">{leaveModalWorker.name} ({leaveModalWorker.designation || 'Staff'})</p>
              </div>
              <button
                onClick={() => setLeaveModalWorker(null)}
                className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              {/* Predefined Leave Reason Chips */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 font-mono block mb-2">
                  Select Absence Reason (Zero-typing):
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    'Sick / Medical Leave',
                    'Family Emergency',
                    'Scheduled Casual Leave',
                    'Shift Overtime Relief',
                    'Material Supply Delay',
                    'Authorized Plant Off'
                  ].map(reason => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => {
                        triggerFrontlineHaptic('light');
                        setSelectedLeaveReason(reason);
                      }}
                      className={`min-h-[48px] p-3 rounded-2xl text-xs font-bold border-2 text-left transition-all cursor-pointer ${
                        selectedLeaveReason === reason
                          ? 'bg-blue-50 text-blue-900 border-blue-500 shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>

              {/* Frontline Numeric Stepper for Leave Days */}
              <FrontlineNumericStepper
                label="Absence Duration (Days)"
                value={leaveDurationDays}
                onChange={setLeaveDurationDays}
                min={0.5}
                max={30}
                step={0.5}
                unit="day(s)"
                presets={[0.5, 1, 2, 3, 5]}
              />

              {/* Large-Format Voice Dictated Notes Field (>=18px font) */}
              <ConstrainedVoiceInput
                value={leaveFieldNotes}
                onChange={setLeaveFieldNotes}
                label="Additional Supervisor Note (Optional)"
                placeholder="Tap Voice Input to speak notes or select chips below..."
                optionChips={[
                  'Doctor Certificate Provided',
                  'Prior Approval Given',
                  'Informed via Call',
                  'Emergency Travel',
                  'Replacement Assigned'
                ]}
              />

              {/* Action Buttons: >= 56px height */}
              <div className="flex gap-3.5 pt-2">
                <button
                  type="button"
                  onClick={() => setLeaveModalWorker(null)}
                  className="flex-1 min-h-[56px] rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border-2 border-slate-300 text-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    triggerFrontlineHaptic('confirm');
                    if (leaveModalWorker) {
                      await markOnLeave(leaveModalWorker);
                      setLeaveModalWorker(null);
                    }
                  }}
                  className="flex-1 min-h-[56px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black border-2 border-emerald-500 text-sm active:scale-95 transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Confirm Leave</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ATTENDANCE CONFLICT RESOLUTION MODAL */}
      <ConflictResolutionModal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        tenantId={profile?.tenantId}
        onResolved={async () => {
          if (profile?.tenantId) {
            const list = await conflictService.getConflicts(profile.tenantId);
            setUnresolvedConflictsCount(list.filter(c => c.status === 'UNRESOLVED').length);
          }
        }}
      />

      {/* AUTOMATED ACCESSIBILITY (AXE-CORE) AUDIT MODAL */}
      <A11yAuditModal
        isOpen={isA11yModalOpen}
        onClose={() => setA11yModalOpen(false)}
      />

      {/* EARNED WAGE ACCESS (EWA) MODAL */}
      {ewaModalWorker && profile?.tenantId && (
        <WorkerEwaModal
          isOpen={Boolean(ewaModalWorker)}
          onClose={() => setEwaModalWorker(null)}
          worker={ewaModalWorker}
          tenantId={profile.tenantId}
          attendanceRecords={allAttendanceHistory}
          advances={allAdvances}
          orgSettings={settings}
          onAdvanceCreated={(newAdv) => setAllAdvances(prev => [...prev, newAdv])}
        />
      )}

      {/* SHIFT-SCOPED BREADCRUMBS & FIELD ROUTE MODAL (KEY AC 6) */}
      <ShiftRouteMapModal
        isOpen={showShiftRouteModal}
        onClose={() => {
          setShowShiftRouteModal(false);
          setSelectedWorkerForRoute(undefined);
        }}
        tenantId={profile?.tenantId || ''}
        workers={workers}
        initialWorkerId={selectedWorkerForRoute}
      />

      {/* LONE WORKER SAFETY COMMAND MODAL */}
      <SupervisorSafetyMonitorModal
        isOpen={showSafetyMonitorModal}
        onClose={() => setShowSafetyMonitorModal(false)}
        tenantId={profile?.tenantId || ''}
        branches={settings.branches}
      />
    </div>
  );
};
