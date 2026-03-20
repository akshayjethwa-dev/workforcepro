import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Search, ArrowRight, Clock, AlertCircle, Edit, X, PlusCircle, ChevronDown, ChevronUp, IndianRupee, MapPin, Umbrella, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { wageService } from '../services/wageService';
import { attendanceLogic } from '../services/attendanceLogic';
import { Worker, AttendanceRecord, Punch, OrgSettings, Advance } from '../types/index';

export const WorkerHistoryScreen: React.FC = () => {
  const { profile, limits } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [monthAdvances, setMonthAdvances] = useState<Advance[]>([]);
  const [settings, setSettings] = useState<OrgSettings>({ shifts: [], enableBreakTracking: false });
  const [loading, setLoading] = useState(true);

  // Expanded View State for Punches
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  // Regulation Modal State
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [regulateType, setRegulateType] = useState<'IN' | 'OUT'>('IN');
  const [regulateTime, setRegulateTime] = useState<string>('09:00');
  const [savingRegulation, setSavingRegulation] = useState(false);

  // NEW: Leave Manager Modal State
  const [leaveModal, setLeaveModal] = useState({
    isOpen: false,
    startDate: '',
    endDate: '',
    type: 'cl' as 'cl' | 'sl' | 'pl' | 'lwp',
    reason: ''
  });

  // 1. Load Workers & Settings on Mount
  useEffect(() => {
    if (profile?.tenantId) {
      Promise.all([
         dbService.getWorkers(profile.tenantId),
         dbService.getOrgSettings(profile.tenantId)
      ]).then(([workersData, settingsData]) => {
         setWorkers(workersData);
         setSettings(settingsData);
         setLoading(false);
      });
    }
  }, [profile]);

  // 2. Load Attendance & Advances when Worker or Month changes
  useEffect(() => {
    if (profile?.tenantId && selectedWorkerId) {
      dbService.getAttendanceHistory(profile.tenantId).then(allRecords => {
        const filtered = allRecords.filter(r => 
          r.workerId === selectedWorkerId && 
          r.date.startsWith(selectedMonth)
        );
        filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setAttendanceHistory(filtered);
      });

      dbService.getAdvances(profile.tenantId).then(advances => {
        setMonthAdvances(advances.filter(a => a.workerId === selectedWorkerId && a.date.startsWith(selectedMonth)));
      });
    } else {
        setAttendanceHistory([]);
        setMonthAdvances([]);
    }
  }, [selectedWorkerId, selectedMonth, profile]);

  const selectedWorker = workers.find(w => w.id === selectedWorkerId);

  // 3. Calculate Monthly Calendar Map & Exact Payroll Data
  const monthData = useMemo(() => {
    if (!selectedWorker || !settings || !profile?.tenantId) return null;
    
    // Get exact matching numbers from the payroll engine
    const payroll = wageService.generateMonthlyPayroll(selectedWorker, selectedMonth, attendanceHistory, monthAdvances, settings);

    // Plot every single day of the month for the UI List
    const [yearStr, monthStr] = selectedMonth.split('-');
    const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
    const dailyLogs = [];

    const dailyRate = selectedWorker.wageConfig.type === 'MONTHLY' 
        ? selectedWorker.wageConfig.amount / (selectedWorker.wageConfig.workingDaysPerMonth || daysInMonth) 
        : selectedWorker.wageConfig.amount;

    for (let day = daysInMonth; day >= 1; day--) { // Descending order for the list
        const dateStr = `${yearStr}-${monthStr}-${day.toString().padStart(2, '0')}`;
        const record = attendanceHistory.find(r => r.date === dateStr);
        const isPubHol = settings.holidays?.find(h => h.date === dateStr);
        const isWeekOff = attendanceLogic.isWeeklyOff(dateStr, selectedWorker, settings);

        let status = 'ABSENT';
        let pay = 0;
        let wageRec = null;

        if (record && record.timeline && record.timeline.length > 0) {
            // They worked
            status = (isPubHol || isWeekOff) ? 'HOLIDAY_WORKED' : record.status;
            wageRec = wageService.calculateDailyWage(selectedWorker, record, settings);
            pay = wageRec.breakdown.total;
        } else {
            // They did not work
            if (record && record.status === 'ON_LEAVE') {
                status = 'ON_LEAVE';
                pay = record.leaveInfo?.isPaid ? dailyRate : 0;
            } else if (isPubHol) {
                status = isPubHol.isPaid ? 'PUBLIC_HOLIDAY' : 'UNPAID_HOLIDAY';
                if (isPubHol.isPaid) pay = dailyRate;
            } else if (isWeekOff) {
                status = 'WEEKLY_OFF';
                pay = dailyRate;
            }
        }

        dailyLogs.push({ date: dateStr, status, record, pay, wageRec, isPubHol, isWeekOff });
    }

    const lateDays = attendanceHistory.filter(r => r.lateStatus?.isLate).length;

    return { payroll, dailyLogs, lateDays };
  }, [selectedWorker, selectedMonth, attendanceHistory, monthAdvances, settings, profile]);

  const toggleExpand = (dateStr: string) => {
      setExpandedLogs(prev => {
          const next = new Set(prev);
          if (next.has(dateStr)) next.delete(dateStr);
          else next.add(dateStr);
          return next;
      });
  };

  // 4. Handle Applying Leave (Deducts balance & pushes future records)
  const handleApplyLeave = async () => {
    if (!selectedWorker || !profile?.tenantId || !leaveModal.startDate || !leaveModal.endDate) return;
    setSavingRegulation(true);

    try {
        const start = new Date(leaveModal.startDate);
        const end = new Date(leaveModal.endDate);
        const dates: string[] = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(new Date(d).toISOString().split('T')[0]);
        }

        // Get current balance (fallback to org default if worker has no data)
        let currentBalance = 0;
        if (leaveModal.type !== 'lwp') {
            currentBalance = selectedWorker.leaveBalances?.[leaveModal.type] 
                            ?? settings.leavePolicy?.[leaveModal.type] 
                            ?? 0;
        }
        
        const allowNeg = settings.leavePolicy?.allowNegativeBalance ?? false;
        const newRecords: AttendanceRecord[] = [];
        let newBalance = currentBalance;

        for (const dateStr of dates) {
            let isPaid = false;
            let actualType = leaveModal.type;

            if (leaveModal.type !== 'lwp') {
                if (newBalance > 0 || allowNeg) {
                    isPaid = true;
                    newBalance -= 1;
                } else {
                    // Out of leaves -> Auto Convert to LWP
                    isPaid = false;
                    actualType = 'lwp';
                }
            } else {
                isPaid = false;
            }

            const rec: AttendanceRecord = {
                id: `${profile.tenantId}_${selectedWorker.id}_${dateStr}`,
                tenantId: profile.tenantId,
                workerId: selectedWorker.id,
                workerName: selectedWorker.name,
                date: dateStr,
                shiftId: selectedWorker.shiftId || 'default',
                timeline: [],
                status: 'ON_LEAVE',
                lateStatus: { isLate: false, lateByMins: 0, penaltyApplied: false },
                hours: { gross: 0, net: 0, overtime: 0 },
                leaveInfo: {
                    type: actualType === 'lwp' ? 'LWP' : actualType.toUpperCase() as any,
                    isPaid,
                    reason: leaveModal.reason
                }
            };
            newRecords.push(rec);
        }

        // 1. Save Attendance Records
        await Promise.all(newRecords.map(r => dbService.markAttendanceOnline(r)));

        // 2. Update Worker Balance in DB
        if (leaveModal.type !== 'lwp') {
            const updatedLeaveBalances = {
                ...(selectedWorker.leaveBalances || {cl:0, sl:0, pl:0}),
                [leaveModal.type]: newBalance
            };
            await dbService.updateWorker(selectedWorker.id, { leaveBalances: updatedLeaveBalances });
            
            // Update local worker state so UI refreshes immediately
            const updatedWorker = { ...selectedWorker, leaveBalances: updatedLeaveBalances };
            setWorkers(prev => prev.map(w => w.id === updatedWorker.id ? updatedWorker : w));
        }

        setLeaveModal({ isOpen: false, startDate: '', endDate: '', type: 'cl', reason: '' });
        
        // Refresh History
        const updatedDocs = await dbService.getAttendanceHistory(profile.tenantId);
        setAttendanceHistory(updatedDocs.filter(r => r.workerId === selectedWorkerId && r.date.startsWith(selectedMonth)).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

    } catch (e) {
        console.error(e);
        alert("Failed to apply leave.");
    } finally {
        setSavingRegulation(false);
    }
  };

  // 5. Handle Regulating a Missed Punch
  const handleSaveRegulation = async () => {
    if (!editingRecord || !profile?.tenantId || !selectedWorker) return;
    setSavingRegulation(true);

    try {
      const [year, month, day] = editingRecord.date.split('-').map(Number);
      const [hour, min] = regulateTime.split(':').map(Number);
      const localDate = new Date(year, month - 1, day, hour, min);
      
      const newPunch: Punch = { timestamp: localDate.toISOString(), type: regulateType, device: 'MANUAL_OVERRIDE_BY_ADMIN' };

      let updatedTimeline = [...(editingRecord.timeline || [])];
      
      if (regulateType === 'IN') {
          const firstInIdx = updatedTimeline.findIndex(p => p.type === 'IN');
          if (firstInIdx >= 0) updatedTimeline[firstInIdx] = newPunch;
          else updatedTimeline.push(newPunch);
      } else {
          const reverseOutIdx = [...updatedTimeline].reverse().findIndex(p => p.type === 'OUT');
          if (reverseOutIdx >= 0) {
              const lastOutIdx = updatedTimeline.length - 1 - reverseOutIdx;
              updatedTimeline[lastOutIdx] = newPunch;
          } else updatedTimeline.push(newPunch);
      }

      updatedTimeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const shift = settings.shifts.find(s => s.id === selectedWorker.shiftId) || settings.shifts[0];
      const lateCount = await dbService.getMonthlyLateCount(profile.tenantId, selectedWorker.id);

      const draftRecord: AttendanceRecord = { ...editingRecord, timeline: updatedTimeline, status: 'ABSENT' }; // Clear ON_LEAVE if they punch

      const finalRecord = attendanceLogic.processDailyStatus(
          draftRecord, shift, lateCount, settings.enableBreakTracking, selectedWorker, settings
      );

      await dbService.markAttendanceOnline(finalRecord);

      setAttendanceHistory(prev => {
         const exists = prev.find(r => r.id === finalRecord.id);
         if (exists) return prev.map(r => r.id === finalRecord.id ? finalRecord : r);
         return [...prev, finalRecord];
      });
      
      setEditingRecord(null);

    } catch (error) {
      console.error("Failed to regulate punch:", error);
      alert("Failed to save the regulated punch.");
    } finally {
      setSavingRegulation(false);
    }
  };

  const openRegulationModal = (dateStr: string, existingRecord?: AttendanceRecord) => {
      if (existingRecord) {
          setEditingRecord(existingRecord);
          setRegulateType('IN');
          const firstIn = existingRecord.timeline?.find(p => p.type === 'IN');
          if (firstIn) {
              const time = new Date(firstIn.timestamp);
              setRegulateTime(`${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`);
          } else {
              setRegulateTime('09:00');
          }
      } else {
          setEditingRecord({
              id: `${profile!.tenantId}_${selectedWorker!.id}_${dateStr}`,
              tenantId: profile!.tenantId,
              workerId: selectedWorker!.id,
              workerName: selectedWorker!.name,
              date: dateStr,
              shiftId: selectedWorker!.shiftId || 'default',
              timeline: [],
              status: 'ABSENT',
              lateStatus: { isLate: false, lateByMins: 0, penaltyApplied: false },
              hours: { gross: 0, net: 0, overtime: 0 }
          });
          setRegulateType('IN');
          setRegulateTime('09:00');
      }
  };

  if (loading) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="p-4 bg-gray-50 min-h-screen pb-24 relative">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Worker History</h1>

      {/* FILTERS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 space-y-4">
         <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Select Worker</label>
            <div className="relative mt-1">
                <select 
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg outline-none appearance-none font-bold"
                    value={selectedWorkerId}
                    onChange={(e) => setSelectedWorkerId(e.target.value)}
                >
                    <option value="">-- Choose a Worker --</option>
                    {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <Search className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" size={18}/>
            </div>
         </div>

         <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Select Month</label>
            <input 
                type="month" 
                className="w-full p-3 mt-1 bg-gray-50 border border-gray-200 rounded-lg outline-none font-bold"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
            />
         </div>
      </div>

      {/* CONTENT */}
      {selectedWorkerId && monthData ? (
        <>
            {/* Monthly Summary Card */}
            <div className="bg-linear-to-r from-blue-600 to-indigo-700 rounded-xl p-5 text-white shadow-lg mb-6 relative overflow-hidden">
                <div className="relative z-10">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-blue-100 text-xs font-bold uppercase">Estimated Net Earnings</p>
                            <h3 className="text-3xl font-bold mt-1">₹{monthData.payroll.netPayable.toLocaleString()}</h3>
                            {monthData.payroll.deductions.total > 0 && (
                               <p className="text-[10px] text-blue-200 mt-1 font-medium">
                                  Gross: ₹{monthData.payroll.earnings.gross.toLocaleString()} - Deductions: ₹{monthData.payroll.deductions.total.toLocaleString()}
                               </p>
                            )}
                        </div>
                        <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm">
                            <Calendar className="text-white" size={24} />
                        </div>
                    </div>
                    
                   <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mt-6 pt-4 border-t border-white/20">
                        <div className="bg-white/10 rounded-xl p-2 text-center">
                            <p className="text-lg font-bold leading-none">{monthData.payroll.attendanceSummary.presentDays}</p>
                            <p className="text-[9px] text-blue-200 uppercase mt-1">Present</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-2 text-center">
                            <p className="text-lg font-bold leading-none">{monthData.payroll.attendanceSummary.absentDays}</p>
                            <p className="text-[9px] text-blue-200 uppercase mt-1">Absent</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-2 text-center">
                            <p className="text-lg font-bold leading-none">{monthData.payroll.attendanceSummary.weeklyOffs}</p>
                            <p className="text-[9px] text-blue-200 uppercase mt-1">Wk Offs</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-2 text-center">
                            <p className="text-lg font-bold leading-none">{monthData.payroll.attendanceSummary.publicHolidays}</p>
                            <p className="text-[9px] text-blue-200 uppercase mt-1">Holidays</p>
                        </div>
                        
                        {/* RESTORED: Holiday Overtime */}
                        <div className="bg-green-500/20 border border-green-400/30 rounded-xl p-2 text-center shadow-inner">
                            <p className="text-lg font-bold text-green-300 leading-none">{monthData.payroll.attendanceSummary.holidayWorkedDays}</p>
                            <p className="text-[9px] text-green-200 uppercase font-black tracking-wider mt-1">Hol. OT</p>
                        </div>

                        <div className="bg-white/10 rounded-xl p-2 text-center">
                            <p className="text-lg font-bold leading-none">{monthData.payroll.attendanceSummary.paidLeaves}</p>
                            <p className="text-[9px] text-blue-200 uppercase mt-1">Paid Lv</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-2 text-center">
                            <p className="text-lg font-bold leading-none">{monthData.payroll.attendanceSummary.unpaidLeaves}</p>
                            <p className="text-[9px] text-blue-200 uppercase mt-1">Unpaid Lv</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-2 text-center">
                            <p className="text-lg font-bold leading-none">{monthData.payroll.attendanceSummary.halfDays}</p>
                            <p className="text-[9px] text-blue-200 uppercase mt-1">Half Day</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-2 text-center">
                            <p className="text-lg font-bold leading-none">{monthData.lateDays}</p>
                            <p className="text-[9px] text-blue-200 uppercase mt-1">Late</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-2 text-center">
                            <p className="text-lg font-bold leading-none">{monthData.payroll.attendanceSummary.totalOvertimeHours.toFixed(1)}h</p>
                            <p className="text-[9px] text-blue-200 uppercase mt-1">Overtime</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* LEAVE BALANCES CARD */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
               <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-gray-700 text-sm flex items-center">
                     <Calendar className="mr-2 text-indigo-500" size={16}/> Leave Balances
                  </h3>
                  <button
                    onClick={() => {
                       if (!limits?.advancedLeavesEnabled) {
                           alert("Recording custom leaves (CL/SL/PL) is a premium feature. Upgrade to Pro to track leave balances.");
                           return;
                       }
                       setLeaveModal({ ...leaveModal, isOpen: true });
                    }}
                    className="text-[10px] sm:text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center"
                  >
                    {!limits?.advancedLeavesEnabled && <Lock size={12} className="mr-1" />}
                    + Record Leave
                  </button>
               </div>
               <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 p-3 rounded-xl text-center border border-slate-100">
                     <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Casual (CL)</p>
                     <p className="text-xl font-black text-slate-800">{selectedWorker.leaveBalances?.cl ?? settings?.leavePolicy?.cl ?? 0}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl text-center border border-slate-100">
                     <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Sick (SL)</p>
                     <p className="text-xl font-black text-slate-800">{selectedWorker.leaveBalances?.sl ?? settings?.leavePolicy?.sl ?? 0}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl text-center border border-slate-100">
                     <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Privilege (PL)</p>
                     <p className="text-xl font-black text-slate-800">{selectedWorker.leaveBalances?.pl ?? settings?.leavePolicy?.pl ?? 0}</p>
                  </div>
               </div>
            </div>

            {/* Kharchi / Advances Ledger */}
            {monthAdvances.length > 0 && (
              <div className="bg-white p-4 rounded-xl shadow-sm border border-orange-100 mb-6">
                 <h3 className="font-bold text-gray-700 mb-3 text-sm flex items-center">
                    <IndianRupee size={16} className="mr-1 text-orange-500"/> Kharchi / Advances Ledger
                 </h3>
                 <div className="space-y-2">
                    {monthAdvances.map(adv => (
                       <div key={adv.id} className="flex justify-between items-center text-sm border-b border-gray-50 pb-2">
                          <div>
                             <p className="font-bold text-gray-800">{new Date(adv.date).toLocaleDateString()}</p>
                             <p className="text-xs text-gray-500">{adv.reason}</p>
                          </div>
                          <span className="font-bold text-red-500">-₹{adv.amount}</span>
                       </div>
                    ))}
                    <div className="flex justify-between items-center pt-2 font-bold text-sm">
                       <span>Total Taken:</span>
                       <span className="text-red-600">-₹{monthData.payroll.deductions.advances}</span>
                    </div>
                 </div>
              </div>
            )}

            {/* Daily List */}
            <h3 className="font-bold text-gray-700 mb-3 text-sm">Daily Logs</h3>
            
            <div className="space-y-3">
                {monthData.dailyLogs.map(log => {
                    const sortedTimeline = [...(log.record?.timeline || [])].sort(
                        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                    );
                    const checkIn = sortedTimeline.find(p => p.type === 'IN');
                    const checkOut = sortedTimeline.slice().reverse().find(p => p.type === 'OUT');
                    const isCurrentlyIn = sortedTimeline.length > 0 && sortedTimeline[sortedTimeline.length - 1].type === 'IN';
                    const isExpanded = expandedLogs.has(log.date);

                    const todayStr = new Date().toISOString().split('T')[0];
                    const isToday = log.date === todayStr;
                    
                    let computedStatus = log.status;
                    let displayHours = log.record?.hours?.net || 0;

                    if (isToday && isCurrentlyIn && log.status === 'ABSENT') {
                        computedStatus = 'PENDING';
                        displayHours = attendanceLogic.calculateHours(log.record?.timeline || [], settings.enableBreakTracking);
                    }

                    let statusColor = 'bg-gray-100 text-gray-500';
                    let statusText = computedStatus.replace('_', ' ');

                    if (computedStatus === 'PRESENT') { statusColor = 'bg-green-100 text-green-700'; }
                    else if (computedStatus === 'HALF_DAY') { statusColor = 'bg-orange-100 text-orange-700'; }
                    else if (computedStatus === 'PENDING') { statusColor = 'bg-blue-50 text-blue-600 animate-pulse'; statusText = 'IN PROGRESS'; }
                    else if (computedStatus === 'ON_LEAVE') { statusColor = log.record?.leaveInfo?.isPaid ? 'bg-indigo-100 text-indigo-700' : 'bg-red-50 text-red-500'; statusText = log.record?.leaveInfo?.isPaid ? `PAID LEAVE (${log.record?.leaveInfo?.type})` : 'UNPAID LEAVE'; }
                    else if (computedStatus === 'WEEKLY_OFF') { statusColor = 'bg-slate-200 text-slate-700'; }
                    else if (computedStatus === 'PUBLIC_HOLIDAY') { statusColor = 'bg-purple-100 text-purple-700'; statusText = 'HOLIDAY'; }
                    else if (computedStatus === 'HOLIDAY_WORKED') { statusColor = 'bg-green-200 text-green-800 font-black'; statusText = 'HOLIDAY OT'; }
                    else if (computedStatus === 'UNPAID_HOLIDAY') { statusColor = 'bg-red-50 text-red-500'; statusText = 'UNPAID HOL'; }
                    else { statusColor = 'bg-red-100 text-red-700'; statusText = 'ABSENT'; }

                    return (
                        <div key={log.date} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                            {/* Top Header */}
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <span className="font-bold text-gray-900 block">
                                        {new Date(log.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                                        {log.isPubHol && <span className="text-[10px] text-purple-500 ml-2 font-bold block sm:inline">({log.isPubHol.name})</span>}
                                    </span>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1 ${statusColor}`}>
                                        {statusText}
                                        {log.record?.lateStatus?.isLate && computedStatus !== 'PENDING' && <span className="ml-1 text-red-600 font-extrabold">• LATE</span>}
                                    </span>
                                    {log.record?.status === 'ON_LEAVE' && log.record.leaveInfo?.reason && (
                                        <p className="text-[10px] text-gray-500 mt-1 italic">"{log.record.leaveInfo.reason}"</p>
                                    )}
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <span className="text-green-600 font-bold">₹{log.pay.toFixed(2)}</span>
                                    <p className="text-[10px] text-gray-400">Daily Pay</p>
                                    
                                    {(profile?.role === 'FACTORY_OWNER' || profile?.role === 'SUPERVISOR') && (
                                      <button 
                                        onClick={() => {
                                            if (!limits?.regulatePunchEnabled) {
                                                alert("Manually regulating and overriding punches is a premium feature. Please upgrade your plan.");
                                                return;
                                            }
                                            openRegulationModal(log.date, log.record);
                                        }}
                                        className="mt-2 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded flex items-center transition-colors"
                                      >
                                        {!limits?.regulatePunchEnabled ? <Lock size={10} className="mr-1" /> : <Edit size={10} className="mr-1" />}
                                        Regulate
                                      </button>
                                    )}
                                </div>
                            </div>

                            {/* Detailed Expandable Timeline */}
                            {sortedTimeline.length > 0 && (
                                <div className="bg-gray-50 p-3 rounded-lg text-xs mt-3 border border-gray-100">
                                   <div 
                                      className={`flex justify-between items-center text-gray-700 font-bold cursor-pointer ${isExpanded ? 'border-b border-gray-200 pb-2 mb-2' : ''}`}
                                      onClick={() => toggleExpand(log.date)}
                                   >
                                       <div className="flex items-center space-x-2">
                                           <span>Net: {displayHours.toFixed(1)} hrs</span>
                                           <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded-full text-gray-600">{sortedTimeline.length} Punches</span>
                                           {log.record?.hours?.overtime > 0 && <span className="text-orange-500 font-bold ml-2">(+{log.record.hours.overtime} OT)</span>}
                                       </div>
                                       <div className="flex items-center text-blue-600">
                                           {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                       </div>
                                   </div>

                                   {!isExpanded ? (
                                       <div className="flex justify-between items-center text-gray-500 mt-2">
                                           <div className="flex flex-col">
                                               <span className="text-[9px] uppercase font-bold text-gray-400">First In</span>
                                               <span className="font-bold text-gray-700">
                                                   {checkIn ? new Date(checkIn.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}
                                               </span>
                                           </div>
                                           <ArrowRight size={14} className="text-gray-300"/>
                                           <div className="flex flex-col text-right">
                                               <span className="text-[9px] uppercase font-bold text-gray-400">Last Out</span>
                                               <span className="font-bold text-gray-700">
                                                    {checkOut ? new Date(checkOut.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : <span className="text-blue-600 animate-pulse">Active</span>}
                                               </span>
                                           </div>
                                       </div>
                                   ) : (
                                       <div className="space-y-2 mt-3">
                                           {sortedTimeline.map((punch, idx) => {
                                               const isRegulated = punch.device === 'MANUAL_OVERRIDE_BY_ADMIN';
                                               return (
                                                   <div key={idx} className="flex justify-between items-center text-gray-600 bg-white p-2 rounded border border-gray-100 shadow-sm">
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
                        </div>
                    );
                })}
            </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Search size={48} className="mb-4 opacity-20" />
            <p>Select a worker to view history</p>
        </div>
      )}

      {/* LEAVE MODAL */}
      {leaveModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
              <h3 className="font-bold text-gray-800 flex items-center text-lg">
                  <Calendar className="text-indigo-500 mr-2" size={20} />
                  Record Leave
              </h3>
              <button onClick={() => setLeaveModal({ ...leaveModal, isOpen: false })} className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 mb-8">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">From Date</label>
                  <input type="date" value={leaveModal.startDate} onChange={e => setLeaveModal({...leaveModal, startDate: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-indigo-500 transition-all" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">To Date</label>
                  <input type="date" value={leaveModal.endDate} onChange={e => setLeaveModal({...leaveModal, endDate: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-indigo-500 transition-all" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Leave Type</label>
                <select value={leaveModal.type} onChange={e => setLeaveModal({...leaveModal, type: e.target.value as any})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-indigo-500 transition-all">
                  <option value="cl">Casual Leave (CL)</option>
                  <option value="sl">Sick Leave (SL)</option>
                  <option value="pl">Privilege Leave (PL)</option>
                  <option value="lwp">Leave Without Pay (LWP)</option>
                </select>
                {leaveModal.type !== 'lwp' && (!settings.leavePolicy?.allowNegativeBalance) && (
                   <p className="text-[10px] text-orange-600 mt-1 font-medium bg-orange-50 p-1.5 rounded-md border border-orange-100">
                     If balance runs out, remaining days will automatically convert to LWP.
                   </p>
                )}
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Reason (Optional)</label>
                <input type="text" placeholder="e.g. Medical, Going to village" value={leaveModal.reason} onChange={e => setLeaveModal({...leaveModal, reason: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-sm focus:ring-2 focus:ring-indigo-500 transition-all" />
              </div>
            </div>

            <button
              onClick={handleApplyLeave}
              disabled={savingRegulation || !leaveModal.startDate || !leaveModal.endDate}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl flex justify-center items-center disabled:opacity-50 transition-colors shadow-lg shadow-indigo-600/30"
            >
              {savingRegulation ? <Loader2 className="animate-spin mr-2" size={20}/> : <PlusCircle size={20} className="mr-2" />} 
              {savingRegulation ? 'Applying...' : 'Confirm Leave'}
            </button>
          </div>
        </div>
      )}

      {/* REGULATION MODAL */}
      {editingRecord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-800">Regulate Punch</h3>
              <button onClick={() => setEditingRecord(null)} className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 p-1.5 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 mb-6 bg-blue-50 border border-blue-100 p-3 rounded-xl">
              Modifying punch for <span className="font-bold text-blue-800">{new Date(editingRecord.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric'})}</span>.
            </p>

            <div className="space-y-5 mb-8">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Punch Action</label>
                <div className="flex space-x-2 mt-2">
                  <button 
                    onClick={() => setRegulateType('IN')}
                    className={`flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all ${regulateType === 'IN' ? 'bg-green-50 border-green-500 text-green-700 shadow-sm' : 'border-gray-100 bg-white text-gray-400'}`}
                  >
                    Check IN
                  </button>
                  <button 
                    onClick={() => setRegulateType('OUT')}
                    className={`flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all ${regulateType === 'OUT' ? 'bg-red-50 border-red-500 text-red-700 shadow-sm' : 'border-gray-100 bg-white text-gray-400'}`}
                  >
                    Check OUT
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Correct Time</label>
                <input 
                  type="time" 
                  value={regulateTime}
                  onChange={(e) => setRegulateTime(e.target.value)}
                  className="w-full p-4 mt-2 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-lg text-center tracking-widest focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            <button
              onClick={handleSaveRegulation}
              disabled={savingRegulation}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl flex justify-center items-center disabled:opacity-50 transition-colors shadow-lg shadow-blue-600/30"
            >
              {savingRegulation ? 'Saving...' : <><PlusCircle size={20} className="mr-2" /> Save Regulation</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};