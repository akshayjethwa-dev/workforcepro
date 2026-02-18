import React, { useState, useEffect } from 'react';
import { User, CheckCircle, Clock, Calendar, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { Worker, AttendanceRecord } from '../types/index';

export const AttendanceScreen: React.FC = () => {
  const { profile } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceRecord>>({});
  const [loading, setLoading] = useState(true);

  // Load Workers AND Today's Attendance
  useEffect(() => {
    const loadData = async () => {
      if (profile?.tenantId) {
        try {
          const [fetchedWorkers, fetchedAttendance] = await Promise.all([
            dbService.getWorkers(profile.tenantId),
            dbService.getTodayAttendance(profile.tenantId)
          ]);
          
          setWorkers(fetchedWorkers);

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

  const markStatus = async (worker: Worker, status: 'PRESENT' | 'HALF_DAY' | 'ON_LEAVE') => {
    if (!profile?.tenantId) return;
    
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];
    const recordId = `${profile.tenantId}_${worker.id}_${todayDate}`;

    // Check if record already exists to preserve timeline/punches
    const existingRecord = attendanceMap[worker.id];
    
    let finalRecord: AttendanceRecord;

    if (existingRecord) {
        // UPDATE EXISTING: Keep timeline, just change status
        finalRecord = {
            ...existingRecord,
            status: status,
            // Update metadata to show manual override
            inTime: {
                ...existingRecord.inTime!,
                markedBy: 'supervisor', // Flag that admin touched it
            }
        };
    } else {
        // CREATE NEW: Full manual entry
        finalRecord = {
            id: recordId,
            tenantId: profile.tenantId,
            workerId: worker.id,
            workerName: worker.name,
            date: todayDate,
            shiftId: worker.shiftId,
            timeline: [], // No punches yet
            lateStatus: { isLate: false, lateByMins: 0, penaltyApplied: false },
            hours: { gross: 9, net: 9, overtime: 0 }, // Default standard day
            inTime: { 
                timestamp: now.toISOString(), 
                geoLocation: {lat:0,lng:0}, 
                deviceInfo:'Manual Admin', 
                markedBy:'supervisor'
            },
            status: status
        };
    }

    // Optimistic Update
    setAttendanceMap(prev => ({ ...prev, [worker.id]: finalRecord }));

    try {
      await dbService.markAttendance(finalRecord);
    } catch (e) {
      alert("Failed to save attendance");
    }
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
            <h2 className="text-xl font-bold text-gray-800">Manual Attendance</h2>
            <p className="text-xs text-gray-500">{new Date().toLocaleDateString('en-IN', {weekday: 'long', day:'numeric', month:'long'})}</p>
          </div>
          <div className="text-xs font-bold bg-white px-3 py-1 rounded-full shadow-sm text-gray-600">
             Total: {workers.length}
          </div>
      </div>

      <div className="space-y-3">
        {workers.map(worker => {
            const record = attendanceMap[worker.id];
            const isPresent = record?.status === 'PRESENT';
            const isHalfDay = record?.status === 'HALF_DAY';
            const isOnLeave = record?.status === 'ON_LEAVE';
            
            // Safely calculate display time
            let displayTime = '--:--';
            let displaySource = '';

            if (record) {
                if (record.timeline && record.timeline.length > 0) {
                    const lastPunch = record.timeline[record.timeline.length - 1];
                    displayTime = new Date(lastPunch.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                    displaySource = lastPunch.device === 'Kiosk' ? 'Worker (Kiosk)' : 'Supervisor';
                } else if (record.inTime) {
                    displayTime = new Date(record.inTime.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                    displaySource = record.inTime.markedBy === 'self' ? 'Worker (Kiosk)' : 'Supervisor';
                }
            }

            return (
                <div key={worker.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col transition-all">
                    {/* Worker Header */}
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center space-x-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${isPresent ? 'bg-green-500' : isHalfDay ? 'bg-orange-500' : isOnLeave ? 'bg-blue-400' : 'bg-gray-300'}`}>
                                {worker.name.charAt(0)}
                            </div>
                            <div>
                                <p className="font-bold text-gray-800">{worker.name}</p>
                                <p className="text-xs text-gray-500">{worker.designation}</p>
                            </div>
                        </div>
                        
                        {/* Status Badge */}
                        {record && (
                            <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase flex items-center ${
                                isPresent ? 'bg-green-100 text-green-700' : 
                                isHalfDay ? 'bg-orange-100 text-orange-700' : 
                                'bg-blue-100 text-blue-700'
                            }`}>
                                {isPresent && <CheckCircle size={12} className="mr-1"/>}
                                {isHalfDay && <Clock size={12} className="mr-1"/>}
                                {isOnLeave && <Calendar size={12} className="mr-1"/>}
                                {record.status.replace('_', ' ')}
                            </div>
                        )}
                    </div>

                    {/* Info Bar (If Record Exists) */}
                    {record && (
                        <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg text-xs text-gray-500 mb-3">
                           <span>Marked By: <span className="font-medium text-gray-700">{displaySource}</span></span>
                           <span>Last Active: <span className="font-medium text-gray-700">{displayTime}</span></span>
                        </div>
                    )}

                    {/* Action Buttons (ALWAYS VISIBLE - Allows Manual Override) */}
                    <div className="grid grid-cols-3 gap-2">
                        <button 
                            onClick={() => markStatus(worker, 'PRESENT')}
                            disabled={isPresent}
                            className={`flex items-center justify-center py-2 rounded-lg text-xs font-bold border transition-all ${
                                isPresent 
                                ? 'bg-green-600 text-white border-green-600 opacity-50 cursor-not-allowed' 
                                : 'bg-white text-green-700 border-green-200 hover:bg-green-50'
                            }`}
                        >
                            Present
                        </button>
                        <button 
                            onClick={() => markStatus(worker, 'HALF_DAY')}
                            disabled={isHalfDay}
                            className={`flex items-center justify-center py-2 rounded-lg text-xs font-bold border transition-all ${
                                isHalfDay 
                                ? 'bg-orange-500 text-white border-orange-500 opacity-50 cursor-not-allowed' 
                                : 'bg-white text-orange-700 border-orange-200 hover:bg-orange-50'
                            }`}
                        >
                            Half Day
                        </button>
                        <button 
                            onClick={() => markStatus(worker, 'ON_LEAVE')}
                            disabled={isOnLeave}
                            className={`flex items-center justify-center py-2 rounded-lg text-xs font-bold border transition-all ${
                                isOnLeave 
                                ? 'bg-blue-500 text-white border-blue-500 opacity-50 cursor-not-allowed' 
                                : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
                            }`}
                        >
                            On Leave
                        </button>
                    </div>
                </div>
            );
        })}

        {workers.length === 0 && !loading && (
            <div className="text-center py-10 text-gray-400">
                <AlertCircle className="mx-auto mb-2" />
                <p>No workers found to mark attendance.</p>
            </div>
        )}
      </div>
    </div>
  );
};