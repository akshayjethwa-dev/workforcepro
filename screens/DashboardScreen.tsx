import React, { useState, useEffect } from 'react';
import { 
  Users, CheckCircle, Clock, Calendar, AlertTriangle, 
  ChevronRight, RefreshCw, PlusCircle, FileText, PlayCircle, XCircle
} from 'lucide-react';
import { storageService } from '../services/storage';
import { Worker, AttendanceRecord } from '../types';

interface Props {
  onOpenKiosk: () => void;
}

export const DashboardScreen: React.FC<Props> = ({ onOpenKiosk }) => {
  const [stats, setStats] = useState({
    total: 0,
    present: 0,
    absent: 0,
    late: 0,
    onLeave: 0
  });
  const [recentActivity, setRecentActivity] = useState<AttendanceRecord[]>([]);
  const [deptStats, setDeptStats] = useState<{name: string, present: number, total: number, pct: number}[]>([]);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const refreshData = () => {
    const workers = storageService.getWorkers();
    const allAttendance = storageService.getAttendance();
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Filter today's records
    const todaysRecords = allAttendance.filter(a => a.date === todayStr);
    
    // 1. Summary Stats
    const activeWorkers = workers.filter(w => w.status === 'ACTIVE');
    const total = activeWorkers.length;
    const present = todaysRecords.filter(r => r.status === 'PRESENT' || r.status === 'HALF_DAY').length;
    const late = todaysRecords.filter(r => r.calculatedHours?.isLate).length;
    // Mocking leave data (assuming some might have status ON_LEAVE, or hardcoding a small number for demo if 0)
    let onLeave = todaysRecords.filter(r => r.status === 'ON_LEAVE').length; 
    
    // Calculate absent
    const absent = Math.max(0, total - present - onLeave);

    setStats({ total, present, absent, late, onLeave });

    // 2. Recent Activity (Live Feed)
    const sorted = [...todaysRecords].sort((a, b) => {
      const timeA = a.outTime ? a.outTime.timestamp : a.inTime.timestamp;
      const timeB = b.outTime ? b.outTime.timestamp : b.inTime.timestamp;
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });
    setRecentActivity(sorted.slice(0, 10)); // Top 10

    // 3. Department Breakdown
    const departments = Array.from(new Set(activeWorkers.map(w => w.department)));
    const dStats = departments.map(dept => {
      const deptWorkers = activeWorkers.filter(w => w.department === dept);
      const deptTotal = deptWorkers.length;
      const deptPresent = deptWorkers.filter(w => 
        todaysRecords.some(r => r.workerId === w.id && (r.status === 'PRESENT' || r.status === 'HALF_DAY'))
      ).length;
      return {
        name: dept,
        present: deptPresent,
        total: deptTotal,
        pct: deptTotal > 0 ? Math.round((deptPresent / deptTotal) * 100) : 0
      };
    });
    setDeptStats(dStats);

    // 4. Alerts
    const newAlerts: string[] = [];
    dStats.forEach(d => {
      if (d.total > 0 && d.present === 0) {
        newAlerts.push(`⚠️ ${d.name} department has zero attendance`);
      }
    });
    if (total > 0 && (absent / total) > 0.15) {
      newAlerts.push(`⚠️ High absence rate (${Math.round((absent/total)*100)}%) today`);
    }
    // Mock overtime alert if late count is high
    if (late > 0) {
        newAlerts.push(`ℹ️ ${late} workers marked late today`);
    }
    
    setAlerts(newAlerts);
    setLastUpdated(new Date());
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000); // 3s polling for "Real-Time" feel
    return () => clearInterval(interval);
  }, []);

  const StatCard = ({ icon: Icon, value, label, subLabel, color, iconBg }: any) => (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between h-32 relative overflow-hidden">
        <div className={`absolute top-0 right-0 p-3 rounded-bl-xl ${iconBg} bg-opacity-20`}>
            <Icon className={color} size={24} />
        </div>
        <div>
            <h3 className={`text-3xl font-bold ${color}`}>{value}</h3>
            <p className="text-gray-500 text-xs font-bold uppercase mt-1">{label}</p>
        </div>
        <p className="text-xs text-gray-400 mt-2">{subLabel}</p>
    </div>
  );

  return (
    <div className="p-4 space-y-6 pb-24">
        {/* Kiosk Button */}
        <button 
            onClick={onOpenKiosk}
            className="w-full bg-indigo-900 text-white rounded-xl p-4 shadow-lg flex items-center justify-between group"
        >
            <div className="flex items-center space-x-3">
                <div className="bg-indigo-800 p-2 rounded-lg group-hover:scale-110 transition-transform">
                    <PlayCircle size={24} className="text-indigo-200" />
                </div>
                <div className="text-left">
                    <p className="font-bold">Launch Kiosk Mode</p>
                    <p className="text-indigo-300 text-xs">Start facial recognition</p>
                </div>
            </div>
            <ChevronRight className="text-indigo-400" />
        </button>

        {/* Top Section - Today's Summary */}
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">Today's Summary</h2>
                <span className="text-[10px] text-gray-400 flex items-center">
                    <RefreshCw size={10} className="mr-1" /> Auto-refreshing
                </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <StatCard 
                    icon={CheckCircle} 
                    value={stats.present} 
                    label="Present" 
                    subLabel={`out of ${stats.total}`} 
                    color="text-green-600" 
                    iconBg="bg-green-100"
                />
                <StatCard 
                    icon={XCircle} 
                    value={stats.absent} 
                    label="Absent" 
                    subLabel={`${stats.absent} workers`} 
                    color="text-red-500" 
                    iconBg="bg-red-100"
                />
                <StatCard 
                    icon={Clock} 
                    value={stats.late} 
                    label="Late Arrivals" 
                    subLabel={`${stats.late} workers late`} 
                    color="text-orange-500" 
                    iconBg="bg-orange-100"
                />
                <StatCard 
                    icon={Calendar} 
                    value={stats.onLeave} 
                    label="On Leave" 
                    subLabel={`${stats.onLeave} approved`} 
                    color="text-blue-500" 
                    iconBg="bg-blue-100"
                />
            </div>
        </div>

        {/* Alerts Banner */}
        {alerts.length > 0 && (
            <div className="space-y-2">
                {alerts.map((alert, idx) => (
                    <div key={idx} className="bg-orange-50 border-l-4 border-orange-400 p-3 rounded-r-lg flex items-start">
                        <AlertTriangle size={16} className="text-orange-500 mt-0.5 mr-2 flex-shrink-0" />
                        <p className="text-sm text-orange-800 font-medium">{alert}</p>
                    </div>
                ))}
            </div>
        )}

        {/* Middle Section - Live Attendance Feed */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-gray-800 flex items-center">
                    Live Attendance <span className="ml-2 w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                </h3>
                <span className="text-xs text-gray-400">{lastUpdated.toLocaleTimeString()}</span>
            </div>
            <div className="max-h-80 overflow-y-auto">
                {recentActivity.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">Waiting for attendance...</div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {recentActivity.map(record => {
                            const isOut = !!record.outTime;
                            const time = isOut ? record.outTime!.timestamp : record.inTime.timestamp;
                            const worker = storageService.getWorkers().find(w => w.id === record.workerId);
                            
                            return (
                                <div key={record.attendanceId + (isOut ? '_out' : '_in')} className={`p-3 flex items-center space-x-3 ${isOut ? 'bg-gray-50' : 'bg-green-50/30'}`}>
                                    <div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden flex-shrink-0 border border-gray-100">
                                        <img src={`https://ui-avatars.com/api/?name=${record.workerName}&background=random`} alt="" className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-800 truncate">{record.workerName}</p>
                                        <p className="text-xs text-gray-500 truncate">{worker?.department || 'General'}</p>
                                        <p className="text-xs text-gray-400 mt-0.5 flex items-center">
                                            <Clock size={10} className="mr-1" />
                                            {new Date(time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                        </p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <span className={`inline-block px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                            isOut ? 'bg-gray-200 text-gray-600' : 
                                            record.calculatedHours?.isLate ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
                                        }`}>
                                            {isOut ? 'Check Out' : (record.calculatedHours?.isLate ? `Late ${record.calculatedHours.lateByMinutes}m` : 'On Time')}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>

        {/* Department Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-bold text-gray-800 mb-4">Department Status</h3>
            <div className="space-y-4">
                {deptStats.map(dept => (
                    <div key={dept.name}>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-gray-700">{dept.name}</span>
                            <span className="text-gray-500">{dept.present}/{dept.total} ({dept.pct}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div 
                                className={`h-2 rounded-full ${
                                    dept.pct === 100 ? 'bg-green-500' : 
                                    dept.pct < 50 ? 'bg-red-500' : 'bg-blue-500'
                                }`} 
                                style={{ width: `${dept.pct}%` }}
                            ></div>
                        </div>
                    </div>
                ))}
                {deptStats.length === 0 && <p className="text-xs text-gray-400 italic">No department data available.</p>}
            </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
            <button className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center text-center active:bg-gray-50" onClick={() => alert('Manual Attendance Mode')}>
                <PlusCircle size={24} className="text-blue-600 mb-2" />
                <span className="text-xs font-bold text-gray-700">Manual Attendance</span>
            </button>
            <button className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center text-center active:bg-gray-50" onClick={() => alert('Opening Overtime Requests...')}>
                <Clock size={24} className="text-orange-500 mb-2" />
                <span className="text-xs font-bold text-gray-700">Overtime Requests</span>
            </button>
            <button className="col-span-2 bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center text-center active:bg-gray-50" onClick={() => alert('Opening Leave Approvals...')}>
                <FileText size={24} className="text-purple-500 mb-2" />
                <span className="text-xs font-bold text-gray-700">Approve Leave Requests</span>
            </button>
        </div>
    </div>
  );
};
