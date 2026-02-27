import React, { useState, useEffect } from 'react';
import { User, CheckCircle, Clock, Calendar, AlertCircle, LogIn, LogOut, Loader2, ChevronDown, ChevronUp, ArrowRight, MapPin } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { attendanceLogic } from '../services/attendanceLogic';
import { Worker, AttendanceRecord, OrgSettings } from '../types/index';
import { geoUtils } from '../utils/geo'; 

export const AttendanceScreen: React.FC = () => {
  const { profile } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceRecord>>({});
  const [settings, setSettings] = useState<OrgSettings>({ shifts: [], enableBreakTracking: false });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Expanded View State
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  useEffect(() => {
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
          console.error(e);
        } finally {
          setLoading(false);
        }
      }
    };
    loadData();
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
        let currentTimeline = existingRecord?.timeline || [];
        
        const newPunch = {
            timestamp: now.toISOString(),
            type: type,
            device: 'Mobile App',
            location: currentLocation,
            isOutOfGeofence
        };

        const newTimeline = [...currentTimeline, newPunch];

        const shift = settings.shifts.find(s => s.id === worker.shiftId) || settings.shifts[0];
        const lateCount = await dbService.getMonthlyLateCount(profile.tenantId, worker.id);

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

        const finalRecord = attendanceLogic.processDailyStatus(
            baseRecord, 
            shift, 
            lateCount, 
            settings.enableBreakTracking
        );

        await dbService.markAttendance(finalRecord);
        setAttendanceMap(prev => ({ ...prev, [worker.id]: finalRecord }));

        if (isOutOfGeofence) {
            await dbService.addNotification({
                tenantId: profile.tenantId,
                title: 'Geofence Violation Alert',
                message: `${worker.name} punched ${type} outside the allowed factory radius.`,
                type: 'WARNING',
                createdAt: new Date().toISOString(),
                read: false
            });
            alert(`Warning: Punch recorded outside the ${settings.baseLocation?.radius}m factory radius!`);
        }

        if (finalRecord.lateStatus.isLate && !existingRecord?.lateStatus?.isLate) {
             await dbService.addNotification({
                tenantId: profile.tenantId,
                title: 'Late Arrival',
                message: `${worker.name} checked in late today.`,
                type: 'INFO',
                createdAt: new Date().toISOString(),
                read: false
            });
        }

    } catch (e) {
        console.error("Punch Error", e);
        alert("Failed to update attendance");
    } finally {
        setActionLoading(null);
    }
  };

  const markOnLeave = async (worker: Worker) => {
      if (!profile?.tenantId) return;
      if (!window.confirm(`Mark ${worker.name} as ON LEAVE?`)) return;

      const todayDate = new Date().toISOString().split('T')[0];
      const recordId = `${profile.tenantId}_${worker.id}_${todayDate}`;

      const leaveRecord: AttendanceRecord = {
          id: recordId,
          tenantId: profile.tenantId,
          workerId: worker.id,
          workerName: worker.name,
          date: todayDate,
          shiftId: worker.shiftId,
          timeline: [], 
          status: 'ON_LEAVE',
          lateStatus: { isLate: false, lateByMins: 0, penaltyApplied: false },
          hours: { gross: 0, net: 0, overtime: 0 }
      };

      await dbService.markAttendance(leaveRecord);
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

  if (loading) return (
     <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
     </div>
  );

  return (
    <div className="p-4 bg-gray-50 min-h-screen pb-24">
      <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Manual Entry</h2>
            <p className="text-xs text-gray-500">{new Date().toLocaleDateString('en-IN', {weekday: 'long', day:'numeric', month:'long'})}</p>
          </div>
          <div className="text-xs font-bold bg-white px-3 py-1 rounded-full shadow-sm text-gray-600">
             Staff: {workers.length}
          </div>
      </div>

      <div className="space-y-3">
        {workers.map(worker => {
            const record = attendanceMap[worker.id];
            
            const sortedTimeline = [...(record?.timeline || [])].sort(
                (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            
            const lastPunch = sortedTimeline[sortedTimeline.length - 1];
            const isInside = lastPunch?.type === 'IN';
            const isOnLeave = record?.status === 'ON_LEAVE';
            const isExpanded = expandedLogs.has(worker.id);
            
            let statusLabel = 'ABSENT';
            let statusColor = 'bg-gray-100 text-gray-500';

            if (isOnLeave) {
                statusLabel = 'ON LEAVE';
                statusColor = 'bg-blue-100 text-blue-700';
            } else if (isInside) {
                statusLabel = 'IN PROGRESS';
                statusColor = 'bg-blue-50 text-blue-600 animate-pulse';
            } else if (record?.status === 'PRESENT') {
                statusLabel = 'PRESENT';
                statusColor = 'bg-green-100 text-green-700';
            } else if (record?.status === 'HALF_DAY') {
                statusLabel = 'HALF DAY';
                statusColor = 'bg-orange-100 text-orange-700';
            }

            return (
                <div key={worker.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col transition-all">
                    {/* Worker Header */}
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center space-x-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${isInside ? 'bg-green-500' : 'bg-gray-300'}`}>
                                {worker.name.charAt(0)}
                            </div>
                            <div>
                                <p className="font-bold text-gray-800">{worker.name}</p>
                                <p className="text-xs text-gray-500">{worker.designation}</p>
                            </div>
                        </div>
                        
                        <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${statusColor}`}>
                            {statusLabel}
                        </div>
                    </div>

                    {/* EXPANDABLE TIMELINE INFO */}
                    {record && !isOnLeave && sortedTimeline.length > 0 && (
                        <div className="bg-gray-50 p-3 rounded-lg text-xs mb-4">
                           {/* Summary / Toggle Bar */}
                           <div 
                              className={`flex justify-between items-center text-gray-700 font-bold cursor-pointer ${isExpanded ? 'border-b border-gray-200 pb-2 mb-2' : ''}`}
                              onClick={() => toggleExpand(worker.id)}
                           >
                               <div className="flex items-center space-x-2">
                                   <span>Net: {record.hours.net.toFixed(1)} hrs</span>
                                   <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded-full text-gray-600">{sortedTimeline.length} Punches</span>
                               </div>
                               <div className="flex items-center text-blue-600">
                                   {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                               </div>
                           </div>

                           {/* Collapsed View (First & Last) */}
                           {!isExpanded ? (
                               <div className="flex justify-between items-center text-gray-500 mt-2">
                                   <div className="flex flex-col">
                                       <span className="text-[9px] uppercase font-bold text-gray-400">First In</span>
                                       <span className="font-bold text-gray-700">
                                           {sortedTimeline.find(p => p.type === 'IN') 
                                               ? new Date(sortedTimeline.find(p => p.type === 'IN')!.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) 
                                               : '--:--'}
                                       </span>
                                   </div>
                                   <ArrowRight size={14} className="text-gray-300"/>
                                   <div className="flex flex-col text-right">
                                       <span className="text-[9px] uppercase font-bold text-gray-400">Last Out</span>
                                       <span className="font-bold text-gray-700">
                                            {sortedTimeline.slice().reverse().find(p => p.type === 'OUT') 
                                               ? new Date(sortedTimeline.slice().reverse().find(p => p.type === 'OUT')!.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) 
                                               : <span className="text-green-600">Active</span>}
                                       </span>
                                   </div>
                               </div>
                           ) : (
                               /* Expanded View (Full Details) */
                               <div className="space-y-2 mt-3">
                                   {sortedTimeline.map((punch, idx) => {
                                       const isRegulated = punch.device === 'MANUAL_OVERRIDE_BY_ADMIN';
                                       return (
                                           <div key={idx} className="flex justify-between items-center text-gray-600 bg-white p-2 rounded border border-gray-100">
                                                <div className="flex items-center flex-wrap gap-1">
    <div className={`w-2 h-2 rounded-full mr-1 ${punch.type === 'IN' ? 'bg-green-500' : 'bg-red-500'}`}></div>
    <span className="font-bold uppercase tracking-wide mr-1">{punch.type}</span>
    {isRegulated && (
        <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase font-bold">Regulated</span>
    )}
    {punch.isOutOfGeofence && (
        <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded uppercase font-bold flex items-center" title="Outside Geofence">
            <MapPin size={10} className="mr-0.5"/> Out of Zone
        </span>
    )}
</div>
                                                <span className="font-mono font-bold text-gray-800">
                                                    {new Date(punch.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                                </span>
                                           </div>
                                       );
                                   })}
                               </div>
                           )}
                        </div>
                    )}

                    {/* ACTION BUTTONS */}
                    <div className="grid grid-cols-5 gap-2 mt-auto">
                        <button 
                            onClick={() => handlePunch(worker, 'IN')}
                            disabled={isInside || isOnLeave || actionLoading === worker.id}
                            className={`col-span-2 flex items-center justify-center py-2.5 rounded-lg text-xs font-bold border transition-all ${
                                isInside 
                                ? 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed' 
                                : 'bg-green-600 text-white border-green-600 hover:bg-green-700 shadow-sm'
                            }`}
                        >
                            {actionLoading === worker.id ? <Loader2 className="animate-spin" size={14}/> : <><LogIn size={14} className="mr-1.5"/> Check In</>}
                        </button>

                        <button 
                            onClick={() => handlePunch(worker, 'OUT')}
                            disabled={!isInside || isOnLeave || actionLoading === worker.id}
                            className={`col-span-2 flex items-center justify-center py-2.5 rounded-lg text-xs font-bold border transition-all ${
                                !isInside
                                ? 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed' 
                                : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                            }`}
                        >
                             <LogOut size={14} className="mr-1.5"/> Check Out
                        </button>
                        
                        <button 
                            onClick={() => markOnLeave(worker)}
                            className="col-span-1 flex items-center justify-center py-2 rounded-lg text-blue-600 bg-blue-50 hover:bg-blue-100 border border-transparent"
                            title="Mark On Leave"
                        >
                            <Calendar size={16} />
                        </button>
                    </div>
                </div>
            );
        })}

        {workers.length === 0 && !loading && (
            <div className="text-center py-10 text-gray-400">
                <AlertCircle className="mx-auto mb-2" />
                <p>No workers found.</p>
            </div>
        )}
      </div>
    </div>
  );
};