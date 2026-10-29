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
  Zap
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import { attendanceLogic } from '../services/attendanceLogic';
import { syncService } from '../services/syncService';
import { Worker, AttendanceRecord, OrgSettings } from '../types/index';
import { geoUtils } from '../utils/geo';
import { FRONTLINE_TOUCH, triggerFrontlineHaptic } from '../utils/frontlineTouch';
import { FrontlineWipeOverlay } from '../components/FrontlineWipeOverlay';
import { FrontlineErgonomicsModal } from '../components/FrontlineErgonomicsModal';

export const AttendanceScreen: React.FC = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceRecord>>({});
  const [settings, setSettings] = useState<OrgSettings>({ shifts: [], enableBreakTracking: false });
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
          const [fetchedWorkers, fetchedAttendance, fetchedSettings] = await Promise.all([
            dbService.getWorkers(profile.tenantId),
            dbService.getTodayAttendance(profile.tenantId),
            dbService.getOrgSettings(profile.tenantId)
          ]);
          
          setWorkers(fetchedWorkers);
          setSettings(fetchedSettings);
          
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
  }, [profile]);

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

        const baseRecord: AttendanceRecord = existingRecord || {
            id: recordId,
            tenantId: profile.tenantId,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Attendance Register</h1>
            {isOffline && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-md border border-amber-200" title="Offline Mode Active">
                <WifiOff size={13} /> Offline Cache
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
            <span>Frontline Glove-Safe Touch Standards (≥56px & 72px Clock Confirm)</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-600">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          </div>
        </div>

        {/* Supervisor Controls & Conflict Resolution Trigger (min-h-[56px] for gloves) */}
        <div className="flex items-center gap-2.5 flex-wrap">
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
        </div>
      </div>

      {/* METRIC STRIP (Tabular figures) */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1 sm:pb-0 text-xs font-mono tabular-nums">
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

      {/* RESPONSIVE DUAL-VIEWPORT GRID: 1 column on mobile, 2 columns on desktop */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filteredWorkers.map(worker => {
            const record = attendanceMap[worker.id];
            
            const sortedTimeline = [...(record?.timeline || [])].sort(
                (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            
            const lastPunch = sortedTimeline[sortedTimeline.length - 1];
            const isInside = lastPunch?.type === 'IN';
            const isOnLeave = record?.status === 'ON_LEAVE';
            const isExpanded = expandedLogs.has(worker.id);
            const isSelectedForQuickClock = worker.id === selectedQuickWorkerId;
            
            let statusLabel = 'NOT IN';
            let statusTextColor = 'text-slate-600';
            if (isOnLeave) {
                statusLabel = record?.leaveInfo?.isPaid ? 'PAID LEAVE' : 'ON LEAVE';
                statusTextColor = 'text-indigo-700 font-black';
            } else if (isInside) {
                statusLabel = 'ON FLOOR (INSIDE)';
                statusTextColor = 'text-emerald-700 font-black';
            } else if (record?.status === 'PRESENT') {
                statusLabel = 'PRESENT (COMPLETED)';
                statusTextColor = 'text-emerald-700 font-black';
            } else if (record?.status === 'HALF_DAY') {
                statusLabel = 'HALF DAY';
                statusTextColor = 'text-amber-700 font-black';
            }

            return (
                <div 
                  key={worker.id}
                  onClick={() => setSelectedQuickWorkerId(worker.id)}
                  className={`bg-white p-5 rounded-3xl border-2 transition-all flex flex-col justify-between relative cursor-pointer ${
                    isSelectedForQuickClock 
                      ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-md' 
                      : 'border-slate-200/90 hover:border-slate-300 shadow-xs'
                  }`}
                >
                    {/* Visual Audit Dimension Overlay Tag if enabled */}
                    {isAuditOverlayActive && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-blue-600 text-white font-mono text-[9px] font-bold z-10 shadow-xs">
                        56px Targets + 14px Gap
                      </div>
                    )}

                    <div>
                      {/* HEADER ROW */}
                      <div className="flex justify-between items-start gap-3">
                          <div className="flex items-center gap-3.5 min-w-0">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-base text-white shrink-0 overflow-hidden relative shadow-xs ${isInside ? 'bg-emerald-600 border-2 border-emerald-400' : 'bg-slate-700 border-2 border-slate-500'}`}>
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
                              <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-extrabold text-sm sm:text-base text-slate-900 truncate">{worker.name}</p>
                                    {isSelectedForQuickClock && (
                                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-mono font-bold shrink-0">
                                        Quick Dock
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                                      <span className="font-medium">{worker.designation || 'Worker'}</span>
                                      <span aria-hidden="true" className="text-slate-300">·</span>
                                      <span className="font-mono tabular-nums">{worker.phone}</span>
                                  </div>
                              </div>
                          </div>
                          
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <div className={`text-xs uppercase tracking-wide font-black ${statusTextColor}`}>
                                  {statusLabel}
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

                      {/* TIMELINE PREVIEW */}
                      {record && !isOnLeave && sortedTimeline.length > 0 && (
                          <div className="bg-slate-50 p-3.5 rounded-2xl text-xs mt-4 border border-slate-100">
                             <div 
                                className={`flex justify-between items-center text-slate-700 font-bold cursor-pointer ${isExpanded ? 'border-b border-slate-200 pb-2 mb-2' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpand(worker.id);
                                }}
                             >
                                 <div className="flex items-center gap-2">
                                     <span className="font-mono tabular-nums font-bold text-slate-900">
                                       Net: {record.hours.net.toFixed(1)} hrs
                                     </span>
                                     <span className="text-[11px] text-slate-500 font-mono">
                                       · {sortedTimeline.length} punches
                                     </span>
                                 </div>
                                 <div className="flex items-center text-blue-600 text-xs">
                                     <span className="mr-1 text-[11px]">{isExpanded ? 'Hide' : 'Timeline'}</span>
                                     {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                 </div>
                             </div>

                             {!isExpanded ? (
                                 <div className="flex justify-between items-center text-slate-600 mt-2 font-mono tabular-nums text-xs">
                                     <div>
                                         <span className="text-[10px] uppercase text-slate-400 block font-sans">First Punch In</span>
                                         <span className="font-bold text-slate-800">
                                             {sortedTimeline.find(p => p.type === 'IN') 
                                                  ? new Date(sortedTimeline.find(p => p.type === 'IN')!.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
                                                  : '--:--'}
                                         </span>
                                     </div>
                                     <ArrowRight size={14} className="text-slate-300"/>
                                     <div className="text-right">
                                         <span className="text-[10px] uppercase text-slate-400 block font-sans">Latest Status</span>
                                         <span className="font-bold text-slate-800">
                                              {sortedTimeline.slice().reverse().find(p => p.type === 'OUT')
                                                  ? new Date(sortedTimeline.slice().reverse().find(p => p.type === 'OUT')!.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
                                                  : <span className="text-emerald-700 font-bold">Inside Floor</span>}
                                         </span>
                                     </div>
                                 </div>
                             ) : (
                                 <div className="space-y-1.5 mt-2 max-h-48 overflow-y-auto">
                                     {sortedTimeline.map((punch, idx) => {
                                         const isRegulated = punch.device === 'MANUAL_OVERRIDE_BY_ADMIN' || punch.device.includes('Admin');
                                         return (
                                             <div key={idx} className="flex justify-between items-center text-slate-600 bg-white p-2.5 rounded-xl border border-slate-100 text-xs font-mono tabular-nums">
                                                  <div className="flex items-center gap-1.5">
                                                      <span className={`w-2.5 h-2.5 rounded-full ${punch.type === 'IN' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                      <span className="font-bold font-sans uppercase text-[11px]">{punch.type}</span>
                                                      {isRegulated && (
                                                          <span className="text-[10px] text-blue-600 font-sans">· Admin</span>
                                                      )}
                                                      {punch.isOutOfGeofence && (
                                                          <span className="text-[10px] text-amber-600 font-sans flex items-center gap-0.5">
                                                              <MapPin size={10} /> Out of Zone
                                                          </span>
                                                      )}
                                                  </div>
                                                  <span className="font-bold text-slate-800">
                                                      {new Date(punch.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                                  </span>
                                             </div>
                                         );
                                     })}
                                 </div>
                             )}
                          </div>
                      )}
                    </div>

                    {/* FRONTLINE ACTIONS STRIP (≥56px Minimum Touch Target, ≥12px Spacing between adjacent buttons) */}
                    <div className="grid grid-cols-5 gap-3.5 mt-4 pt-3.5 border-t border-slate-100">
                        {/* PUNCH IN: Minimum 56px height, high-contrast emerald */}
                        <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePunch(worker, 'IN');
                            }}
                            disabled={isInside || actionLoading === worker.id || isScreenLockedForWipe} 
                            className={`col-span-2 min-h-[56px] flex items-center justify-center px-3 py-3 rounded-2xl text-xs sm:text-sm font-black transition-all active:scale-95 cursor-pointer border-2 ${
                                isInside
                                 ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                                 : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-md active:bg-emerald-800'
                            }`}
                            title="Punch In (Frontline safe 56px touch target)"
                        >
                            {actionLoading === worker.id ? (
                              <Loader2 className="animate-spin" size={20}/>
                            ) : (
                              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wide">
                                <LogIn size={18} strokeWidth={2.5}/> 
                                Check In
                              </span>
                            )}
                        </button>

                        {/* PUNCH OUT: Minimum 56px height, high-contrast rose */}
                        <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePunch(worker, 'OUT');
                            }}
                            disabled={!isInside || actionLoading === worker.id || isScreenLockedForWipe}
                            className={`col-span-2 min-h-[56px] flex items-center justify-center px-3 py-3 rounded-2xl text-xs sm:text-sm font-black transition-all active:scale-95 cursor-pointer border-2 ${
                                !isInside
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                                : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-500 shadow-md active:bg-rose-800'
                            }`}
                            title="Punch Out (Frontline safe 56px touch target)"
                        > 
                            {actionLoading === worker.id ? (
                              <Loader2 className="animate-spin" size={20}/>
                            ) : (
                              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wide">
                                <LogOut size={18} strokeWidth={2.5}/> 
                                Check Out
                              </span>
                            )}
                        </button>
                        
                        {/* MARK LEAVE: Minimum 56px height, minimum 56px width */}
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
                            className="col-span-1 min-h-[56px] min-w-[56px] flex items-center justify-center rounded-2xl text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border-2 border-slate-300 transition-colors active:scale-95 cursor-pointer shadow-xs"
                            title="Constrained Leave / Note Entry (No typing)"
                        >
                            <Calendar size={20} strokeWidth={2.2} />
                        </button>
                    </div>
                </div>
            );
        })}

        {filteredWorkers.length === 0 && !loading && (
            <div className="col-span-full text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300">
                <AlertCircle className="mx-auto mb-3 text-slate-300" size={32} />
                <p className="text-base font-bold text-slate-800">No personnel found for this view</p>
                <p className="text-xs text-slate-400 mt-1">Try switching filter tabs or clearing the search box.</p>
            </div>
        )}
      </div>

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
    </div>
  );
};
