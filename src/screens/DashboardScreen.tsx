// src/screens/DashboardScreen.tsx
import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, Clock, Calendar, ChevronRight, RefreshCw, PlayCircle, XCircle, Timer, Activity, Lock, MapPin, Bot,
  BookOpen, CheckCircle2, ArrowRight, Sparkles, X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext'; // NEW: Import theme context
import { dbService } from '../services/db';
import { attendanceLogic } from '../services/attendanceLogic';
import { AttendanceRecord, OrgSettings, ScreenName } from '../types/index';
import { AIChat } from '../components/AIChat';
import { SetupGuideModal } from '../components/SetupGuideModal';

interface Props {
  onOpenKiosk: (branchId: string) => void;
  onNavigate?: (screen: ScreenName) => void;
}

export const DashboardScreen: React.FC<Props> = ({ onOpenKiosk, onNavigate }) => {
  const { profile, limits, user } = useAuth();
  const { branding } = useTheme(); // NEW: Pull dynamic branding
  
  const [showGuide, setShowGuide] = useState(false);
  const [hideChecklist, setHideChecklist] = useState(() => localStorage.getItem('hide_factory_checklist') === 'true');
  
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

  const StatCard = ({ icon: Icon, value, label, subLabel, accentColor }: any) => (
    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between min-h-[120px] relative">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${accentColor}`}>
          <Icon size={17} />
        </div>
      </div>
      <div className="mt-2">
        <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-slate-900 tracking-tight">
          {value}
        </div>
        {subLabel && (
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <span>{subLabel}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-12">
        {/* PAGE TOOLBAR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                {branding?.logoUrl ? (
                    <img 
                        src={branding.logoUrl} 
                        alt="Logo"
                        className="h-10 w-auto max-w-[100px] object-contain bg-white p-1 rounded-xl border border-slate-200 shadow-xs" 
                    />
                ) : (
                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                        {profile?.companyName ? profile.companyName.charAt(0).toUpperCase() : 'W'}
                    </div>
                )}
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                        {branding?.appName || profile?.companyName || 'Factory Dashboard'}
                    </h1>
                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>Live Attendance & Shift Status</span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="font-mono tabular-nums text-slate-600">{stats.total} Active Personnel</span>
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-2.5 self-start sm:self-auto">
                {orgSettings?.branches && orgSettings.branches.length > 1 && (
                    <select 
                       className="bg-white border border-slate-200 text-xs font-semibold text-slate-700 py-2 px-3 rounded-xl shadow-xs outline-none hover:border-slate-300 transition-colors"
                       value={selectedDashboardBranch} 
                       onChange={e => setSelectedDashboardBranch(e.target.value)}
                    >
                       <option value="ALL">All Branches & Godowns</option>
                       {orgSettings.branches.map(b => (
                           <option key={b.id} value={b.id}>{b.name}</option>
                       ))}
                    </select>
                )}
                <button 
                  onClick={() => setShowGuide(true)}
                  className="px-3 py-2 bg-white rounded-xl border border-slate-200 shadow-xs hover:bg-slate-50 hover:border-slate-300 text-slate-700 active:scale-95 transition-all text-xs font-semibold flex items-center gap-1.5 min-h-[38px]"
                  title="Factory Setup & Operational Guide"
                >
                  <BookOpen size={15} className="text-indigo-600" />
                  <span className="hidden sm:inline">Setup Guide</span>
                </button>
                <button 
                  onClick={refreshData} 
                  title="Refresh live metrics"
                  className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs hover:bg-slate-50 hover:border-slate-300 text-slate-600 active:scale-95 transition-all min-w-[38px] min-h-[38px] flex items-center justify-center"
                >
                    <RefreshCw size={17} className={loading ? "animate-spin text-blue-600" : "text-slate-600"}/>
                </button>
            </div>
        </div>

        {/* HERO KIOSK LAUNCHER & QUICK WORKSPACE ACTIONS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
                {limits?.kioskEnabled !== false ? (
                    <div 
                        onClick={handleKioskLaunch}
                        className="bg-slate-900 hover:bg-slate-800 text-white rounded-2xl p-5 shadow-xs transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-800 active:scale-[0.99]"
                    >
                        <div className="flex items-start sm:items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-900/40 group-hover:scale-105 transition-transform">
                                <PlayCircle size={26} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-base text-white tracking-tight">Launch Attendance Kiosk</h3>
                                    <span className="text-xs text-blue-400 font-mono">· Live Station</span>
                                </div>
                                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                                    Biometric Face Recognition & QR code check-in kiosk for factory gates & worker tablets.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            <span className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">Start Terminal</span>
                            <ChevronRight size={16} className="text-slate-400 group-hover:translate-x-1 group-hover:text-white transition-all" />
                        </div>
                    </div>
                ) : (
                    <div className="bg-slate-100 rounded-2xl p-5 border border-slate-200 flex items-center justify-between text-slate-500">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center shrink-0">
                                <Lock size={20} />
                            </div>
                            <div>
                                <h4 className="font-bold text-sm text-slate-700">Face Scan Kiosk (Plan Upgrade Required)</h4>
                                <p className="text-xs text-slate-500 mt-0.5">Upgrade subscription plan to activate automated gate attendance terminals.</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Shift Summary Tile */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Shift Configuration</div>
                    <div className="text-base font-bold text-slate-900 mt-1">
                        {orgSettings?.shifts && orgSettings.shifts.length > 0 ? orgSettings.shifts[0].name : 'Default Morning Shift'}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                        {orgSettings?.shifts && orgSettings.shifts.length > 0 
                            ? `${orgSettings.shifts[0].startTime} — ${orgSettings.shifts[0].endTime}` 
                            : '09:00 AM — 06:00 PM'}
                    </div>
                </div>
                <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span>Grace Period</span>
                    <span className="font-mono font-semibold text-slate-700 tabular-nums">
                        {orgSettings?.shifts?.[0]?.gracePeriodMins || 15} mins
                    </span>
                </div>
            </div>
        </div>

        {showKioskModal && (
            <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
               <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-100">
                   <h2 className="text-base font-bold text-slate-900 mb-1">Select Kiosk Location</h2>
                   <p className="text-xs text-slate-500 mb-5">Select factory or godown for this device terminal. Biometric face descriptors will be loaded specifically for this branch.</p>
                   
                   <div className="space-y-2 mb-6">
                       {orgSettings?.branches?.map(b => (
                           <div 
                              key={b.id} 
                              onClick={() => setSelectedKioskBranch(b.id)}
                              className={`p-3.5 rounded-xl border cursor-pointer flex items-center transition-all ${
                                selectedKioskBranch === b.id 
                                  ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-semibold shadow-xs' 
                                  : 'border-slate-200 hover:border-slate-300 text-slate-700'
                              }`}
                           >
                              <MapPin size={17} className={selectedKioskBranch === b.id ? "text-blue-600 mr-2.5" : "text-slate-400 mr-2.5"} />
                              <span className="text-xs font-semibold">{b.name}</span>
                           </div>
                       ))}
                   </div>

                   <div className="flex gap-2.5">
                       <button 
                         onClick={() => setShowKioskModal(false)} 
                         className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-200 transition-colors"
                       >
                         Cancel
                       </button>
                       <button 
                          onClick={() => { setShowKioskModal(false); onOpenKiosk(selectedKioskBranch); }} 
                          className="flex-1 py-2.5 bg-blue-600 text-white font-semibold rounded-xl text-xs shadow-xs hover:bg-blue-700 transition-colors"
                       >
                          Launch Device
                       </button>
                   </div>
               </div>
            </div>
        )}

        {/* // TEMPORARILY HIDDEN AI CHAT MODAL
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
        */}

        {/* RESPONSIVE METRIC KPIS: 2 columns mobile, 4 columns desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard 
                icon={CheckCircle} 
                value={stats.present + stats.halfDay} 
                label="Present Today" 
                subLabel={`${stats.present} Full Day · ${stats.halfDay} Half Day`}
                accentColor="bg-emerald-50 text-emerald-600"
            />
            <StatCard 
                icon={Timer} 
                value={stats.pending} 
                label="On Shift Now" 
                subLabel="Active Punch Timeline"
                accentColor="bg-blue-50 text-blue-600"
            />
            <StatCard 
                icon={Clock} 
                value={stats.late} 
                label="Late Arrivals" 
                subLabel="Past Grace Window"
                accentColor="bg-amber-50 text-amber-600"
            />
            <StatCard 
                icon={XCircle} 
                value={stats.absent} 
                label="Absent / Off" 
                subLabel={`Staff Base: ${stats.total}`}
                accentColor="bg-rose-50 text-rose-600"
            />
        </div>

        {/* LIVE ACTIVITY FEED */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 sm:px-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-2">
                    <Activity size={17} className="text-blue-600"/>
                    <h3 className="font-bold text-slate-900 text-sm">Real-Time Punch Activity</h3>
                </div>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                    {recentActivity.length} punches logged
                </span>
            </div>
            
            <div className="divide-y divide-slate-100">
                {recentActivity.map(record => {
                    const lastPunch = record.timeline && record.timeline.length > 0 
                        ? record.timeline[record.timeline.length - 1] 
                        : null;
                        
                    const timeStr = lastPunch 
                        ? lastPunch.timestamp 
                        : (record.inTime?.timestamp || new Date().toISOString());

                    const typeStr = lastPunch ? lastPunch.type : 'IN';
                    const isOut = typeStr === 'OUT';

                    let statusTextColor = 'text-slate-600';
                    let statusLabel = record.computedStatus;

                    if (record.computedStatus === 'PRESENT') { statusTextColor = 'text-emerald-700 font-semibold'; statusLabel = 'Present'; }
                    else if (record.computedStatus === 'HALF_DAY') { statusTextColor = 'text-amber-700 font-semibold'; statusLabel = 'Half Day'; }
                    else if (record.computedStatus === 'PENDING') { statusTextColor = 'text-blue-700 font-semibold'; statusLabel = 'In Progress'; }
                    else if (record.computedStatus === 'ABSENT') { statusTextColor = 'text-rose-700 font-semibold'; statusLabel = 'Absent (<4h)'; }

                    return (
                        <div key={record.id} className="p-4 sm:px-6 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                            <div className="flex items-center gap-3.5 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm border border-slate-200 shrink-0">
                                    {record.workerName.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-bold text-slate-900 truncate">{record.workerName}</p>
                                        <span className={`text-xs ${statusTextColor}`}>
                                            · {statusLabel}
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5 font-mono tabular-nums">
                                        <span>{isOut ? 'Check Out' : 'Check In'} at {new Date(timeStr).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        {record.isLate && <span className="text-rose-600 font-bold">· LATE</span>}
                                        {lastPunch?.isOutOfGeofence && (
                                            <span className="text-amber-600 flex items-center gap-0.5" title="Punched outside factory radius">
                                                <MapPin size={11} /> Outside Geofence
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="text-right shrink-0">
                                <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                                    {record.currentHours.toFixed(1)} hrs
                                </span>
                            </div>
                        </div>
                    );
                })}
                {recentActivity.length === 0 && !loading && (
                    <div className="p-10 text-center text-slate-400">
                        <Clock className="mx-auto mb-2 text-slate-300" size={28}/>
                        <p className="text-sm font-medium text-slate-600">No shift punches recorded yet today</p>
                        <p className="text-xs text-slate-400 mt-1">Workers will appear here as they clock in via Face Kiosk or manual punch.</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};