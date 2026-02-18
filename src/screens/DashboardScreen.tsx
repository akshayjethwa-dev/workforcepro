import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, Clock, Calendar, ChevronRight, RefreshCw, PlayCircle, XCircle 
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { AttendanceRecord } from '../types/index';

interface Props {
  onOpenKiosk: () => void;
}

export const DashboardScreen: React.FC<Props> = ({ onOpenKiosk }) => {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0, late: 0, onLeave: 0 });
  const [recentActivity, setRecentActivity] = useState<AttendanceRecord[]>([]);
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

      const total = workers.filter(w => w.status === 'ACTIVE').length;
      
      // Calculate Status based on the NEW Logic (stored in DB record.status)
      const present = attendance.filter(r => r.status === 'PRESENT').length;
      const halfDay = attendance.filter(r => r.status === 'HALF_DAY').length;
      const late = attendance.filter(r => r.lateStatus?.isLate).length;
      const onLeave = attendance.filter(r => r.status === 'ON_LEAVE').length;
      
      // Absent = Total - (Present + HalfDay + OnLeave)
      const absent = Math.max(0, total - (present + halfDay + onLeave));

      // Note: We group Present + HalfDay as "Present" in the UI card usually, 
      // but here we can separate if needed. Let's group for simplicity or show Present.
      setStats({ total, present: present + halfDay, absent, late, onLeave });

      const sorted = [...attendance].sort((a, b) => {
        const getTime = (r: AttendanceRecord) => {
           if (r.timeline && r.timeline.length > 0) {
              return new Date(r.timeline[r.timeline.length - 1].timestamp).getTime();
           }
           if (r.inTime) return new Date(r.inTime.timestamp).getTime();
           return new Date(r.date).getTime();
        };
        return getTime(b) - getTime(a);
      });
      
      setRecentActivity(sorted.slice(0, 5));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshData(); }, [profile]);

  const StatCard = ({ icon: Icon, value, label, color, bg }: any) => (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between h-28 relative overflow-hidden">
        <div className={`absolute top-0 right-0 p-2 rounded-bl-xl ${bg} bg-opacity-20`}>
            <Icon className={color} size={20} />
        </div>
        <div>
            <h3 className={`text-2xl font-bold ${color}`}>{value}</h3>
            <p className="text-gray-500 text-[10px] font-bold uppercase mt-1">{label}</p>
        </div>
    </div>
  );

  return (
    <div className="p-4 space-y-6 pb-24 bg-gray-50 min-h-full">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
                <p className="text-xs text-gray-500">{profile?.companyName || 'My Factory'}</p>
            </div>
            <button onClick={refreshData} className="p-2 bg-white rounded-full shadow-sm"><RefreshCw size={18} className={loading ? "animate-spin text-blue-600" : "text-gray-600"}/></button>
        </div>

        <button onClick={onOpenKiosk} className="w-full bg-indigo-900 text-white rounded-xl p-4 shadow-lg flex items-center justify-between group active:scale-95 transition-transform">
            <div className="flex items-center space-x-3">
                <div className="bg-indigo-800 p-2 rounded-lg"><PlayCircle size={24} className="text-indigo-200" /></div>
                <div className="text-left">
                    <p className="font-bold">Launch Kiosk</p>
                    <p className="text-indigo-300 text-xs">Start Attendance</p>
                </div>
            </div>
            <ChevronRight className="text-indigo-400" />
        </button>

        <div className="grid grid-cols-2 gap-3">
            <StatCard icon={CheckCircle} value={stats.present} label="Present" color="text-green-600" bg="bg-green-100"/>
            <StatCard icon={XCircle} value={stats.absent} label="Absent" color="text-red-500" bg="bg-red-100"/>
            <StatCard icon={Clock} value={stats.late} label="Late" color="text-orange-500" bg="bg-orange-100"/>
            <StatCard icon={Calendar} value={stats.total} label="Total Staff" color="text-blue-500" bg="bg-blue-100"/>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-50"><h3 className="font-bold text-gray-800 text-sm">Live Feed</h3></div>
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

                    return (
                        <div key={record.id} className="p-3 flex items-center space-x-3">
                            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center font-bold text-xs text-gray-500">{record.workerName.charAt(0)}</div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-gray-800">{record.workerName}</p>
                                <p className="text-xs text-gray-400">
                                    {new Date(timeStr).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                </p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded ${
                                isOut ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'
                            }`}>
                                {typeStr}
                            </span>
                        </div>
                    );
                })}
                {recentActivity.length === 0 && <p className="p-4 text-center text-gray-400 text-xs">No activity yet.</p>}
            </div>
        </div>
    </div>
  );
};