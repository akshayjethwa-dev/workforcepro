import React, { useState, useEffect } from 'react';
import { User, CheckCircle, Clock, Calendar, AlertCircle, LogIn, LogOut, Loader2, ChevronDown, ChevronUp, ArrowRight, MapPin, WifiOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dbService } from '../services/db';
import { attendanceLogic } from '../services/attendanceLogic';
import { syncService } from '../services/syncService';
import { Worker, AttendanceRecord, OrgSettings } from '../types/index';
import { geoUtils } from '../utils/geo'; 

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
    if (!profile?.tenantId) return;
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

        let currentTimeline = existingRecord?.timeline || [];
        
        const newPunch = {
            timestamp: now.toISOString(),
            type: type,
            device: 'Mobile App (Admin)',
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
        try {
            await dbService.markAttendance(finalRecord);
        } catch (dbError) {
            console.warn("Network unreachable. Queuing manual punch offline...");
            await syncService.savePunchOffline(finalRecord);
            isOfflinePunch = true;
        }

        setAttendanceMap(prev => ({ ...prev, [worker.id]: finalRecord }));

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
        toast.error("Failed to process punch. Please verify network status.");
    } finally {
        setActionLoading(null);
    }
  };

  const markOnLeave = async (worker: Worker) => {
      if (!profile?.tenantId) return;

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
      <div className="space-y-6 pb-12 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 bg-slate-200 rounded-lg w-52" />
            <div className="h-4 bg-slate-100 rounded-lg w-40" />
          </div>
          <div className="h-9 bg-slate-200 rounded-xl w-32" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
              <div className="h-3 bg-slate-200 rounded w-20" />
              <div className="h-7 bg-slate-200 rounded w-12" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-slate-200 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-32" />
                  <div className="h-3 bg-slate-100 rounded w-24" />
                </div>
              </div>
              <div className="h-10 bg-slate-100 rounded-xl" />
              <div className="grid grid-cols-5 gap-2 pt-2 border-t border-slate-100">
                <div className="col-span-2 h-9 bg-slate-200 rounded-xl" />
                <div className="col-span-2 h-9 bg-slate-200 rounded-xl" />
                <div className="col-span-1 h-9 bg-slate-200 rounded-xl" />
              </div>
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

  return (
    <div className="space-y-6 pb-12">
      
      {/* TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Attendance Register</h1>
            {isOffline && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-semibold rounded-md border border-amber-200" title="Offline Mode Active">
                <WifiOff size={13} /> Offline Cache
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
            <span>Shift Attendance & Manual Punches</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-600">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          </div>
        </div>

        {/* METRIC STRIP (Tabular figures) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 text-xs font-mono tabular-nums">
          <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-500 text-[11px] font-sans">On Floor:</span>
            <span className="font-bold text-slate-900">{activeInsideCount}</span>
          </div>
          <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-slate-500 text-[11px] font-sans">Finished:</span>
            <span className="font-bold text-slate-900">{presentCompletedCount}</span>
          </div>
          <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-slate-500 text-[11px] font-sans">Pending:</span>
            <span className="font-bold text-slate-900">{notStartedCount}</span>
          </div>
        </div>
      </div>

      {/* SEARCH AND STATUS FILTER CONTROLS */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <input 
            type="text" 
            placeholder="Search worker name or phone number..." 
            className="w-full pl-3.5 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all shadow-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Segmented Filter Buttons (conforming to Section 1A interactive filter controls) */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl shrink-0 overflow-x-auto">
          {[
            { id: 'ALL', label: 'All Staff' },
            { id: 'ACTIVE', label: `On Floor (${activeInsideCount})` },
            { id: 'COMPLETED', label: `Done (${presentCompletedCount})` },
            { id: 'ABSENT', label: 'Not In' },
            { id: 'LEAVE', label: `Leave (${leaveCount})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id as any)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap active:scale-95 ${
                filterTab === tab.id 
                  ? 'bg-white text-slate-900 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
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
            
            let statusLabel = 'NOT IN';
            let statusTextColor = 'text-slate-500';

            if (isOnLeave) {
                statusLabel = record?.leaveInfo?.isPaid ? 'PAID LEAVE' : 'ON LEAVE';
                statusTextColor = 'text-indigo-700 font-bold';
            } else if (isInside) {
                statusLabel = 'PUNCHED IN (ON FLOOR)';
                statusTextColor = 'text-emerald-700 font-bold';
            } else if (record?.status === 'PRESENT') {
                statusLabel = 'PRESENT (COMPLETED)';
                statusTextColor = 'text-emerald-700 font-bold';
            } else if (record?.status === 'HALF_DAY') {
                statusLabel = 'HALF DAY';
                statusTextColor = 'text-amber-700 font-bold';
            } else if (record?.status === 'WEEKLY_OFF') {
                statusLabel = 'WEEKLY OFF';
                statusTextColor = 'text-slate-600';
            } else if (record?.status === 'PUBLIC_HOLIDAY') {
                statusLabel = 'PUBLIC HOLIDAY';
                statusTextColor = 'text-purple-700 font-bold';
            } else if (record?.status === 'HOLIDAY_WORKED') {
                statusLabel = 'HOLIDAY OT';
                statusTextColor = 'text-emerald-800 font-extrabold';
            }

            return (
                <div 
                  key={worker.id} 
                  className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                >
                    <div>
                      {/* HEADER ROW */}
                      <div className="flex justify-between items-start gap-3">
                          <div className="flex items-center gap-3.5 min-w-0">
                              <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm text-white shrink-0 overflow-hidden relative ${isInside ? 'bg-emerald-600' : 'bg-slate-700'}`}>
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
                                  <p className="font-bold text-sm text-slate-900 truncate">{worker.name}</p>
                                  <div className="text-xs text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                                      <span>{worker.designation || 'Worker'}</span>
                                      <span aria-hidden="true" className="text-slate-300">·</span>
                                      <span className="font-mono tabular-nums">{worker.phone}</span>
                                  </div>
                              </div>
                          </div>
                          
                          <div className={`text-xs uppercase tracking-wide shrink-0 ${statusTextColor}`}>
                              {statusLabel}
                          </div>
                      </div>

                      {/* TIMELINE PREVIEW */}
                      {record && !isOnLeave && sortedTimeline.length > 0 && (
                          <div className="bg-slate-50/80 p-3.5 rounded-xl text-xs mt-4 border border-slate-100">
                             <div 
                                className={`flex justify-between items-center text-slate-700 font-semibold cursor-pointer ${isExpanded ? 'border-b border-slate-200 pb-2 mb-2' : ''}`}
                                onClick={() => toggleExpand(worker.id)}
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
                                             <div key={idx} className="flex justify-between items-center text-slate-600 bg-white p-2 rounded-lg border border-slate-100 text-xs font-mono tabular-nums">
                                                  <div className="flex items-center gap-1.5">
                                                      <span className={`w-2 h-2 rounded-full ${punch.type === 'IN' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
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

                    {/* ACTIONS STRIP */}
                    <div className="grid grid-cols-5 gap-2 mt-4 pt-3 border-t border-slate-100">
                        <button 
                            onClick={() => handlePunch(worker, 'IN')}
                            disabled={isInside || actionLoading === worker.id} 
                            className={`col-span-2 flex items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                                isInside 
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                            }`}
                        >
                            {actionLoading === worker.id ? <Loader2 className="animate-spin" size={14}/> : <><LogIn size={14} className="mr-1.5"/> Check In</>}
                        </button>

                        <button 
                            onClick={() => handlePunch(worker, 'OUT')}
                            disabled={!isInside || actionLoading === worker.id}
                            className={`col-span-2 flex items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                                !isInside
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                            }`}
                        >
                             {actionLoading === worker.id ? <Loader2 className="animate-spin" size={14}/> : <><LogOut size={14} className="mr-1.5"/> Check Out</>}
                        </button>
                        
                        <button 
                            onClick={() => markOnLeave(worker)}
                            className="col-span-1 flex items-center justify-center py-2 rounded-xl text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors"
                            title="Mark Leave (LWP)"
                        >
                            <Calendar size={15} />
                        </button>
                    </div>
                </div>
            );
        })}

        {filteredWorkers.length === 0 && !loading && (
            <div className="col-span-full text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
                <AlertCircle className="mx-auto mb-2 text-slate-300" size={24} />
                <p className="text-sm font-semibold text-slate-700">No personnel found for this view</p>
                <p className="text-xs text-slate-400 mt-1">Try switching filter tabs or checking worker names.</p>
            </div>
        )}
      </div>
    </div>
  );
};