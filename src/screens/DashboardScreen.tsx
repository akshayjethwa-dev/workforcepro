
import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, Clock, Calendar, ChevronRight, RefreshCw, PlayCircle, XCircle, Timer, Activity
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { attendanceLogic } from '../services/attendanceLogic';
import { AttendanceRecord } from '../types/index';

interface Props {
  onOpenKiosk: () => void;
}

export const DashboardScreen: React.FC<Props> = ({ onOpenKiosk }) => {
  const { profile } = useAuth();
  
  // Stats state including new "Pending" and "Half Day" counters
  const [stats, setStats] = useState({ 
      total: 0, 
      present: 0, 
      halfDay: 0,
      absent: 0, 
      late: 0, 
      pending: 0, // Workers checked in but < 4 hours
      onLeave: 0 
  });
  
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshData = async () => {
    if (!profile?.tenantId) return;
    setLoading(true);
    try {
      const [workers, attendance, settings] = await Promise.all([
        dbService.getWorkers(profile.tenantId),
        dbService.getTodayAttendance(profile.tenantId),
        dbService.getOrgSettings(profile.tenantId)
      ]);

      const activeWorkers = workers.filter(w => w.status === 'ACTIVE');
      const total = activeWorkers.length;
      
      let presentCount = 0;
      let halfDayCount = 0;
      let lateCount = 0;
      let onLeaveCount = 0;
      let pendingCount = 0;

      // Process each attendance record with real-time logic
      const processedActivity = attendance.map(record => {
          // 1. Calculate real-time duration (Current Time - In Time)
          const currentHours = attendanceLogic.calculateHours(record.timeline, settings.enableBreakTracking);
          
          // 2. Determine if currently active (Last punch was IN)
          const lastPunch = record.timeline && record.timeline.length > 0 
              ? record.timeline[record.timeline.length - 1] 
              : null;
          const isCurrentlyIn = lastPunch?.type === 'IN';

          // 3. Dynamic Status Calculation
          let computedStatus = 'ABSENT';
          
          if (record.status === 'ON_LEAVE') {
              computedStatus = 'ON_LEAVE';
          } else {
              if (currentHours >= 6) {
                  computedStatus = 'PRESENT';
              } else if (currentHours >= 4) {
                  computedStatus = 'HALF_DAY';
              } else {
                  // Less than 4 hours
                  if (isCurrentlyIn) {
                      computedStatus = 'PENDING'; // Still working, hasn't reached threshold
                  } else {
                      computedStatus = 'ABSENT'; // Checked out early
                  }
              }
          }

          // 4. Check Late Status (Database source of truth)
          if (record.lateStatus?.isLate) {
              lateCount++;
          }

          return {
              ...record,
              currentHours,
              computedStatus,
              isCurrentlyIn,
              isLate: record.lateStatus?.isLate
          };
      });

      // Aggregate Counts
      processedActivity.forEach(r => {
          if (r.computedStatus === 'PRESENT') presentCount++;
          else if (r.computedStatus === 'HALF_DAY') halfDayCount++;
          else if (r.computedStatus === 'PENDING') pendingCount++;
          else if (r.computedStatus === 'ON_LEAVE') onLeaveCount++;
      });

      // Absent = Total Active - (Anyone who has shown up or is on leave)
      // Note: We count "Checked out < 4h" (ABSENT in computed) as Absent here.
      const attendedOrLeaved = presentCount + halfDayCount + pendingCount + onLeaveCount;
      const absentCount = Math.max(0, total - attendedOrLeaved);

      setStats({ 
          total, 
          present: presentCount, 
          halfDay: halfDayCount,
          absent: absentCount, 
          late: lateCount, 
          pending: pendingCount,
          onLeave: onLeaveCount 
      });

      // Sort by most recent activity time
      const sorted = processedActivity.sort((a, b) => {
        const getLastTime = (r: any) => {
           if (r.timeline && r.timeline.length > 0) {
              return new Date(r.timeline[r.timeline.length - 1].timestamp).getTime();
           }
           return new Date(r.date).getTime(); // Fallback
        };
        return getLastTime(b) - getLastTime(a);
      });
      
      setRecentActivity(sorted);
    } catch (e) {
      console.error("Dashboard refresh error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshData(); }, [profile]);

  // Reusable Stat Card Component
  const StatCard = ({ icon: Icon, value, label, subLabel, color, bg }: any) => (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between h-32 relative overflow-hidden">
        <div className={`absolute top-0 right-0 p-2 rounded-bl-xl ${bg} bg-opacity-30`}>
            <Icon className={color} size={20} />
        </div>
        <div>
            <h3 className={`text-3xl font-bold ${color}`}>{value}</h3>
            <p className="text-gray-600 text-[11px] font-bold uppercase mt-1">{label}</p>
            {subLabel && <p className="text-gray-400 text-[10px] mt-0.5">{subLabel}</p>}
        </div>
    </div>
  );

  return (
    <div className="p-4 space-y-6 pb-24 bg-gray-50 min-h-full">
        {/* Header */}
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
                <p className="text-xs text-gray-500">{profile?.companyName || 'Overview'}</p>
            </div>
            <button onClick={refreshData} className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-100 transition-colors">
                <RefreshCw size={18} className={loading ? "animate-spin text-blue-600" : "text-gray-600"}/>
            </button>
        </div>

        {/* Kiosk Launcher */}
        <button onClick={onOpenKiosk} className="w-full bg-indigo-900 text-white rounded-xl p-4 shadow-lg flex items-center justify-between group active:scale-95 transition-transform">
            <div className="flex items-center space-x-3">
                <div className="bg-indigo-800 p-2 rounded-lg"><PlayCircle size={24} className="text-indigo-200" /></div>
                <div className="text-left">
                    <p className="font-bold">Launch Attendance Kiosk</p>
                    <p className="text-indigo-300 text-xs">Scan Faces for Check-In/Out</p>
                </div>
            </div>
            <ChevronRight className="text-indigo-400 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
            <StatCard 
                icon={CheckCircle} 
                value={stats.present + stats.halfDay} 
                label="Present" 
                subLabel={`${stats.present} Full • ${stats.halfDay} Half`}
                color="text-green-600" 
                bg="bg-green-100"
            />
            <StatCard 
                icon={Timer} 
                value={stats.pending} 
                label="In Progress" 
                subLabel="< 4 Hours Worked"
                color="text-blue-600" 
                bg="bg-blue-100"
            />
             <StatCard 
                icon={Clock} 
                value={stats.late} 
                label="Late Arrival" 
                subLabel="Impacts Salary"
                color="text-orange-500" 
                bg="bg-orange-100"
            />
            <StatCard 
                icon={XCircle} 
                value={stats.absent} 
                label="Absent" 
                subLabel={`Total Staff: ${stats.total}`}
                color="text-red-500" 
                bg="bg-red-100"
            />
        </div>

        {/* Live Feed */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-gray-800 text-sm flex items-center">
                    <Activity size={16} className="mr-2 text-blue-500"/> Live Activity
                </h3>
                <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Today</span>
            </div>
            
            <div className="divide-y divide-gray-50">
                {recentActivity.map(record => {
                    const lastPunch = record.timeline && record.timeline.length > 0 
                        ? record.timeline[record.timeline.length - 1] 
                        : null;
                        
                    const timeStr = lastPunch 
                        ? lastPunch.timestamp 
                        : (record.inTime?.timestamp || new Date().toISOString());

                    const typeStr = lastPunch ? lastPunch.type : 'IN';
                    const isOut = typeStr === 'OUT';

                    // Status Badge Logic for List
                    let badgeColor = 'bg-gray-100 text-gray-500';
                    let badgeText = record.computedStatus;

                    if (record.computedStatus === 'PRESENT') { badgeColor = 'bg-green-100 text-green-700'; badgeText = 'Present'; }
                    else if (record.computedStatus === 'HALF_DAY') { badgeColor = 'bg-orange-100 text-orange-700'; badgeText = 'Half Day'; }
                    else if (record.computedStatus === 'PENDING') { badgeColor = 'bg-blue-50 text-blue-600'; badgeText = 'Pending'; }
                    else if (record.computedStatus === 'ABSENT') { badgeColor = 'bg-red-50 text-red-600'; badgeText = 'Absent (<4h)'; }

                    return (
                        <div key={record.id} className="p-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors">
                            <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center font-bold text-xs text-gray-500 border border-gray-200">
                                {record.workerName.charAt(0)}
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-center">
                                    <p className="text-sm font-bold text-gray-800">{record.workerName}</p>
                                    <span className="text-xs font-mono font-medium text-gray-600">
                                        {record.currentHours.toFixed(1)} hrs
                                    </span>
                                </div>
                                <div className="flex justify-between items-center mt-0.5">
                                    <p className="text-[10px] text-gray-400 flex items-center">
                                        {isOut ? 'Checked Out' : 'Checked In'} at {new Date(timeStr).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                        {record.isLate && <span className="ml-2 text-red-500 font-bold">• LATE</span>}
                                    </p>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${badgeColor}`}>
                                        {badgeText}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {recentActivity.length === 0 && !loading && (
                    <div className="p-8 text-center text-gray-400">
                        <Clock className="mx-auto mb-2 opacity-50" size={24}/>
                        <p className="text-xs">No attendance activity today.</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};