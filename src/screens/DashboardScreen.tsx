// src/screens/DashboardScreen.tsx
import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, Clock, Calendar, ChevronRight, RefreshCw, PlayCircle, XCircle, Timer, Activity, Lock, MapPin, Bot
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { attendanceLogic } from '../services/attendanceLogic';
import { AttendanceRecord, OrgSettings } from '../types/index';
import { AIChat } from '../components/AIChat';

interface Props {
  onOpenKiosk: (branchId: string) => void;
}

export const DashboardScreen: React.FC<Props> = ({ onOpenKiosk }) => {
  const { profile, limits, user } = useAuth(); // ✅ Added 'user' from useAuth
  
  const [stats, setStats] = useState({ 
      total: 0, 
      present: 0, 
      halfDay: 0,
      absent: 0, 
      late: 0, 
      pending: 0, 
      onLeave: 0 
  });
  
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [selectedDashboardBranch, setSelectedDashboardBranch] = useState<string>('ALL');
  const [showKioskModal, setShowKioskModal] = useState(false);
  const [selectedKioskBranch, setSelectedKioskBranch] = useState<string>('default');
  
  // AI Chat state
  const [showAIChat, setShowAIChat] = useState(false);

  const refreshData = async () => {
    if (!profile?.tenantId) return;
    setLoading(true);
    try {
      const [workers, attendance, settings] = await Promise.all([
        dbService.getWorkers(profile.tenantId),
        dbService.getTodayAttendance(profile.tenantId),
        dbService.getOrgSettings(profile.tenantId)
      ]);

      setOrgSettings(settings);

      const activeWorkers = workers.filter(w => 
          w.status === 'ACTIVE' && 
          (selectedDashboardBranch === 'ALL' || (w.branchId || 'default') === selectedDashboardBranch)
      );
      
      const total = activeWorkers.length;
      
      let presentCount = 0;
      let halfDayCount = 0;
      let lateCount = 0;
      let onLeaveCount = 0;
      let pendingCount = 0;

      const activeWorkerIds = new Set(activeWorkers.map(w => w.id));
      const filteredAttendance = attendance.filter(r => activeWorkerIds.has(r.workerId));

      const processedActivity = filteredAttendance.map(record => {
          const currentHours = attendanceLogic.calculateHours(record.timeline, settings.enableBreakTracking);
          
          const lastPunch = record.timeline && record.timeline.length > 0 
              ? record.timeline[record.timeline.length - 1] 
              : null;
          const isCurrentlyIn = lastPunch?.type === 'IN';

          let dynamicallyCalculatedLate = false;
          const shift = settings.shifts.find(s => s.id === record.shiftId) || settings.shifts[0];
          const firstPunch = record.timeline?.find(p => p.type === 'IN');
          
          if (firstPunch && shift) {
              const punchTime = new Date(firstPunch.timestamp);
              const [shiftHour, shiftMin] = shift.startTime.split(':').map(Number);
              const shiftStartTime = new Date(punchTime);
              shiftStartTime.setHours(shiftHour, shiftMin, 0, 0);

              const diffMs = punchTime.getTime() - shiftStartTime.getTime();
              const lateByMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));

              dynamicallyCalculatedLate = lateByMins > (shift.gracePeriodMins || 15);
          }

          let computedStatus = 'ABSENT';
          
          if (record.status === 'ON_LEAVE') {
              computedStatus = 'ON_LEAVE';
          } else {
              if (currentHours >= 6) {
                  computedStatus = 'PRESENT';
              } else if (currentHours >= 4) {
                  computedStatus = 'HALF_DAY';
              } else {
                  if (isCurrentlyIn) {
                      computedStatus = 'PENDING'; 
                  } else {
                      computedStatus = 'ABSENT'; 
                  }
              }
          }

          if (dynamicallyCalculatedLate) {
              lateCount++;
          }

          return {
              ...record,
              currentHours,
              computedStatus,
              isCurrentlyIn,
              isLate: dynamicallyCalculatedLate
          };
      });

      processedActivity.forEach(r => {
          if (r.computedStatus === 'PRESENT') presentCount++;
          else if (r.computedStatus === 'HALF_DAY') halfDayCount++;
          else if (r.computedStatus === 'PENDING') pendingCount++;
          else if (r.computedStatus === 'ON_LEAVE') onLeaveCount++;
      });

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

      const sorted = processedActivity.sort((a, b) => {
        const getLastTime = (r: any) => {
           if (r.timeline && r.timeline.length > 0) {
              return new Date(r.timeline[r.timeline.length - 1].timestamp).getTime();
           }
           return new Date(r.date).getTime(); 
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

  useEffect(() => { refreshData(); }, [profile, selectedDashboardBranch]);

  const handleKioskLaunch = () => {
      const branches = orgSettings?.branches || [];
      if (branches.length > 1) {
          setSelectedKioskBranch(branches[0].id);
          setShowKioskModal(true);
      } else {
          onOpenKiosk(branches[0]?.id || 'default');
      }
  };

  // ✅ NEW: Handler for AI Chat button with auth check
  const handleAIChatOpen = () => {
    if (!user) {
      alert('Please log in to use AI Assistant');
      return;
    }
    if (!profile?.tenantId) {
      alert('Profile not loaded. Please refresh the page.');
      return;
    }
    setShowAIChat(true);
  };

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
        <div className="flex flex-col space-y-3 sm:flex-row sm:justify-between sm:items-center">
            <div>
                <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>
                <p className="text-xs text-gray-500">{profile?.companyName || 'Overview'}</p>
            </div>
            
            <div className="flex items-center space-x-2">
                {orgSettings?.branches && orgSettings.branches.length > 1 && (
                    <select 
                       className="bg-white border border-gray-200 text-sm font-bold text-gray-700 py-1.5 px-3 rounded-lg shadow-sm outline-none"
                       value={selectedDashboardBranch} 
                       onChange={e => setSelectedDashboardBranch(e.target.value)}
                    >
                       <option value="ALL">All Branches</option>
                       {orgSettings.branches.map(b => (
                           <option key={b.id} value={b.id}>{b.name}</option>
                       ))}
                    </select>
                )}
                <button onClick={refreshData} className="p-2 bg-white rounded-lg border border-gray-200 shadow-sm hover:bg-gray-100 transition-colors">
                    <RefreshCw size={18} className={loading ? "animate-spin text-blue-600" : "text-gray-600"}/>
                </button>
            </div>
        </div>

        {/* ✅ FIXED: AI Assistant Button with auth check + gradient fix */}
        <button 
  onClick={handleAIChatOpen}
  className="w-full bg-linear-to-r from-purple-600 to-blue-600 text-white rounded-xl p-4 shadow-lg flex items-center justify-between group active:scale-95 transition-transform"
>
          <div className="flex items-center space-x-3">
            <div className="bg-white/20 p-2 rounded-lg">
              <Bot size={24} className="text-white" />
            </div>
            <div className="text-left">
              <p className="font-bold">AI Factory Assistant</p>
              <p className="text-purple-100 text-xs">Ask anything about your factory</p>
            </div>
          </div>
          <ChevronRight className="text-purple-200 group-hover:translate-x-1 transition-transform" />
        </button>

        {limits?.kioskEnabled !== false ? (
            <button onClick={handleKioskLaunch} className="w-full bg-indigo-900 text-white rounded-xl p-4 shadow-lg flex items-center justify-between group active:scale-95 transition-transform">
                <div className="flex items-center space-x-3">
                    <div className="bg-indigo-800 p-2 rounded-lg"><PlayCircle size={24} className="text-indigo-200" /></div>
                    <div className="text-left">
                        <p className="font-bold">Launch Attendance Kiosk</p>
                        <p className="text-indigo-300 text-xs">Scan Faces for Check-In/Out</p>
                    </div>
                </div>
                <ChevronRight className="text-indigo-400 group-hover:translate-x-1 transition-transform" />
            </button>
        ) : (
             <div className="w-full bg-gray-200 text-gray-500 rounded-xl p-4 shadow-inner flex items-center justify-between opacity-80 cursor-not-allowed">
                <div className="flex items-center space-x-3">
                    <div className="bg-gray-300 p-2 rounded-lg"><Lock size={24} /></div>
                    <div className="text-left">
                        <p className="font-bold text-gray-700">Face Scan Kiosk (Locked)</p>
                        <p className="text-xs text-gray-500">Upgrade to Pro to unlock AI Attendance</p>
                    </div>
                </div>
            </div>
        )}

        {showKioskModal && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
               <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
                   <h2 className="text-lg font-black text-gray-900 mb-2">Select Kiosk Location</h2>
                   <p className="text-xs text-gray-500 mb-6">Which factory/godown is this device located at? We will only download faces for this branch to ensure maximum performance.</p>
                   
                   <div className="space-y-3 mb-6">
                       {orgSettings?.branches?.map(b => (
                           <div 
                              key={b.id} 
                              onClick={() => setSelectedKioskBranch(b.id)}
                              className={`p-4 rounded-xl border-2 cursor-pointer flex items-center transition-all ${selectedKioskBranch === b.id ? 'border-indigo-600 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'}`}
                           >
                              <MapPin size={18} className={selectedKioskBranch === b.id ? "text-indigo-600 mr-3" : "text-gray-400 mr-3"} />
                              <span className="font-bold text-sm text-gray-800">{b.name}</span>
                           </div>
                       ))}
                   </div>

                   <div className="flex space-x-3">
                       <button onClick={() => setShowKioskModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl text-sm hover:bg-gray-200">Cancel</button>
                       <button 
                          onClick={() => { setShowKioskModal(false); onOpenKiosk(selectedKioskBranch); }} 
                          className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl text-sm shadow-lg shadow-indigo-200 hover:bg-indigo-700"
                       >
                          Launch Device
                       </button>
                   </div>
               </div>
            </div>
        )}

        {/* ✅ FIXED: AI Chat Modal with proper auth check */}
        {showAIChat && user && profile?.tenantId && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl h-150 shadow-2xl flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-3">
                  <Bot className="w-6 h-6 text-blue-600" />
                  <h2 className="font-bold text-lg">AI Factory Assistant</h2>
                </div>
                <button 
                  onClick={() => setShowAIChat(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XCircle size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <AIChat 
                  tenantId={profile.tenantId} 
                  language="english" 
                />
              </div>
            </div>
          </div>
        )}

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
                                    <p className="text-[10px] text-gray-400 flex flex-wrap items-center gap-y-1">
                                        {isOut ? 'Checked Out' : 'Checked In'} at {new Date(timeStr).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                        {record.isLate && <span className="ml-2 text-red-500 font-bold">• LATE</span>}
                                        {lastPunch?.isOutOfGeofence && (
                                            <span className="ml-2 text-orange-600 font-bold flex items-center bg-orange-50 px-1.5 py-0.5 rounded" title="Punched outside factory radius">
                                                <MapPin size={10} className="mr-0.5" /> OUT OF ZONE
                                            </span>
                                        )}
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
