import React, { useState, useEffect } from 'react';
import { User, CheckCircle, Clock, Calendar, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { Worker, AttendanceRecord } from '../types/index';

export const AttendanceScreen: React.FC = () => {
  const { profile } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  // Store today's attendance in a "Map" for instant lookup by worker ID
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

          // Convert array to map: { "worker_123": Record, "worker_456": Record }
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
    
    // Optional: Confirm action
    const confirmMsg = status === 'PRESENT' ? "Mark Present?" : status === 'HALF_DAY' ? "Mark Half Day?" : "Mark On Leave?";
    if (!window.confirm(`${confirmMsg} for ${worker.name}`)) return;

    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];
    
    const record: AttendanceRecord = {
        id: `${profile.tenantId}_${worker.id}_${todayDate}`,
        tenantId: profile.tenantId,
        workerId: worker.id,
        workerName: worker.name,
        date: todayDate,
        shiftId: worker.shiftId,
        timeline: [],
        lateStatus: { isLate: false, lateByMins: 0, penaltyApplied: false },
        hours: { gross: 9, net: 9, overtime: 0 },
        inTime: { 
            timestamp: now.toISOString(), 
            geoLocation: {lat:0,lng:0}, 
            deviceInfo:'Manual Admin', 
            markedBy:'supervisor'
        },
        status: status
    };

    // Optimistic Update (Show change immediately before DB finishes)
    setAttendanceMap(prev => ({ ...prev, [worker.id]: record }));

    try {
      await dbService.markAttendance(record);
    } catch (e) {
      alert("Failed to save attendance");
      // Revert on failure (optional, but good practice)
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
                        
                        {/* Status Badge (Visible if already marked) */}
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

                    {/* Action Buttons (Only show if NOT marked yet) */}
                    {!record ? (
                        <div className="grid grid-cols-3 gap-2 mt-1">
                            <button 
                                onClick={() => markStatus(worker, 'PRESENT')}
                                className="flex items-center justify-center py-2 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-100 hover:bg-green-100 active:scale-95"
                            >
                                Present
                            </button>
                            <button 
                                onClick={() => markStatus(worker, 'HALF_DAY')}
                                className="flex items-center justify-center py-2 bg-orange-50 text-orange-700 rounded-lg text-xs font-bold border border-orange-100 hover:bg-orange-100 active:scale-95"
                            >
                                Half Day
                            </button>
                            <button 
                                onClick={() => markStatus(worker, 'ON_LEAVE')}
                                className="flex items-center justify-center py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold border border-blue-100 hover:bg-blue-100 active:scale-95"
                            >
                                On Leave
                            </button>
                        </div>
                    ) : (
                        // If marked, show time details
                        <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg text-xs text-gray-500">
                           <span>Marked By: {record.inTime.markedBy === 'self' ? 'Worker (Kiosk)' : 'Supervisor'}</span>
                           <span>Time: {new Date(record.inTime.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                        </div>
                    )}
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