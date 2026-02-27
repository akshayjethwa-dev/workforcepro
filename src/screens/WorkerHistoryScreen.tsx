import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Search, ArrowRight, Clock, AlertCircle, Edit, X, PlusCircle, ChevronDown, ChevronUp, IndianRupee, MapPin } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { wageService } from '../services/wageService';
import { attendanceLogic } from '../services/attendanceLogic';
import { Worker, AttendanceRecord, Punch, OrgSettings, Advance } from '../types/index';

export const WorkerHistoryScreen: React.FC = () => {
  const { profile } = useAuth();
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
        // Sort by date descending (newest first)
        filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setAttendanceHistory(filtered);
      });

      // Load Advances for Ledger & Net Calculation
      dbService.getAdvances(profile.tenantId).then(advances => {
        setMonthAdvances(advances.filter(a => a.workerId === selectedWorkerId && a.date.startsWith(selectedMonth)));
      });
    } else {
        setAttendanceHistory([]);
        setMonthAdvances([]);
    }
  }, [selectedWorkerId, selectedMonth, profile]);

  const selectedWorker = workers.find(w => w.id === selectedWorkerId);

  // 3. Calculate Summary Stats & Net Earnings
  const summary = useMemo(() => {
    if (!selectedWorker) return null;
    
    let totalEarning = 0;
    let presentDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    let lateDays = 0;
    let totalOT = 0;

    attendanceHistory.forEach(record => {
       const wage = wageService.calculateDailyWage(selectedWorker, record);
       totalEarning += wage.breakdown.total;
       
       if (record.status === 'PRESENT') presentDays++;
       if (record.status === 'HALF_DAY') halfDays++;
       if (record.status === 'ABSENT') absentDays++;
       if (record.lateStatus?.isLate) lateDays++;
       
       totalOT += record.hours?.overtime || 0;
    });

    const totalAdvances = monthAdvances.reduce((sum, a) => sum + a.amount, 0);
    const netEarning = Math.max(0, totalEarning - totalAdvances);

    return { totalEarning, totalAdvances, netEarning, presentDays, halfDays, absentDays, lateDays, totalOT, count: attendanceHistory.length };
  }, [attendanceHistory, monthAdvances, selectedWorker]);

  const toggleExpand = (recordId: string) => {
      setExpandedLogs(prev => {
          const next = new Set(prev);
          if (next.has(recordId)) next.delete(recordId);
          else next.add(recordId);
          return next;
      });
  };

  // 4. Handle Regulating a Missed Punch
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

      const draftRecord: AttendanceRecord = { ...editingRecord, timeline: updatedTimeline };

      const finalRecord = attendanceLogic.processDailyStatus(draftRecord, shift, lateCount, settings.enableBreakTracking);

      await dbService.markAttendanceOnline(finalRecord);

      setAttendanceHistory(prev => prev.map(r => r.id === finalRecord.id ? finalRecord : r));
      setEditingRecord(null);

    } catch (error) {
      console.error("Failed to regulate punch:", error);
      alert("Failed to save the regulated punch.");
    } finally {
      setSavingRegulation(false);
    }
  };

  const openRegulationModal = (record: AttendanceRecord) => {
      setEditingRecord(record);
      setRegulateType('IN');
      const firstIn = record.timeline?.find(p => p.type === 'IN');
      if (firstIn) {
          const time = new Date(firstIn.timestamp);
          setRegulateTime(`${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`);
      } else {
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
      {selectedWorkerId ? (
        <>
            {/* Monthly Summary Card */}
            {summary && (
                <div className="bg-linear-to-r from-blue-600 to-indigo-700 rounded-xl p-5 text-white shadow-lg mb-6 relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-blue-100 text-xs font-bold uppercase">Estimated Net Earnings</p>
                                <h3 className="text-3xl font-bold mt-1">₹{summary.netEarning.toLocaleString()}</h3>
                                {summary.totalAdvances > 0 && (
                                   <p className="text-[10px] text-blue-200 mt-1 font-medium">
                                      Gross: ₹{summary.totalEarning.toLocaleString()} - Advances: ₹{summary.totalAdvances.toLocaleString()}
                                   </p>
                                )}
                            </div>
                            <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm">
                                <Calendar className="text-white" size={24} />
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-2 mt-6 pt-4 border-t border-white/20">
                            <div className="text-center">
                                <p className="text-lg font-bold">{summary.presentDays}</p>
                                <p className="text-[9px] text-blue-200 uppercase">Present</p>
                            </div>
                            <div className="text-center border-l border-white/20">
                                <p className="text-lg font-bold">{summary.absentDays}</p>
                                <p className="text-[9px] text-blue-200 uppercase">Absent</p>
                            </div>
                            <div className="text-center border-l border-white/20">
                                <p className="text-lg font-bold">{summary.lateDays}</p>
                                <p className="text-[9px] text-blue-200 uppercase">Late</p>
                            </div>
                            <div className="text-center border-l border-white/20">
                                <p className="text-lg font-bold">{summary.totalOT.toFixed(1)}h</p>
                                <p className="text-[9px] text-blue-200 uppercase">Overtime</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* NEW: Kharchi / Advances Ledger */}
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
                       <span className="text-red-600">-₹{summary?.totalAdvances}</span>
                    </div>
                 </div>
              </div>
            )}

            {/* Daily List */}
            <h3 className="font-bold text-gray-700 mb-3 text-sm">Daily Records ({attendanceHistory.length})</h3>
            
            <div className="space-y-3">
                {attendanceHistory.map(record => {
                    const wageRec = wageService.calculateDailyWage(selectedWorker!, record);
                    
                    const sortedTimeline = [...(record.timeline || [])].sort(
                        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                    );
                    const checkIn = sortedTimeline.find(p => p.type === 'IN');
                    const checkOut = sortedTimeline.slice().reverse().find(p => p.type === 'OUT');
                    const isCurrentlyIn = sortedTimeline.length > 0 && sortedTimeline[sortedTimeline.length - 1].type === 'IN';
                    const isExpanded = expandedLogs.has(record.id);

                    const todayStr = new Date().toISOString().split('T')[0];
                    const isToday = record.date === todayStr;
                    
                    let displayHours = record.hours?.net || 0;
                    
                    // FIX: Explicitly tell TypeScript that computedStatus can be 'PENDING' too
                    let computedStatus: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE' | 'PENDING' = record.status;
                    
                    if (isToday && record.status !== 'ON_LEAVE') {
                        displayHours = attendanceLogic.calculateHours(record.timeline || [], settings.enableBreakTracking);
                        if (displayHours >= 6) computedStatus = 'PRESENT';
                        else if (displayHours >= 4) computedStatus = 'HALF_DAY';
                        else {
                            if (isCurrentlyIn) computedStatus = 'PENDING';
                            else computedStatus = 'ABSENT';
                        }
                    }

                    let statusColor = 'bg-gray-100 text-gray-500';
                    let statusText = 'ABSENT';

                    if (computedStatus === 'PRESENT') { statusColor = 'bg-green-100 text-green-700'; statusText = 'PRESENT'; }
                    else if (computedStatus === 'HALF_DAY') { statusColor = 'bg-orange-100 text-orange-700'; statusText = 'HALF DAY'; }
                    else if (computedStatus === 'PENDING') { statusColor = 'bg-blue-50 text-blue-600 animate-pulse'; statusText = 'IN PROGRESS'; }
                    else if (computedStatus === 'ON_LEAVE') { statusColor = 'bg-blue-100 text-blue-700'; statusText = 'ON LEAVE'; }
                    else { statusColor = 'bg-red-100 text-red-700'; statusText = 'ABSENT'; }
                    
                    return (
                        <div key={record.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                            {/* Top Header */}
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <span className="font-bold text-gray-900 block">
                                        {new Date(record.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                                    </span>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1 ${statusColor}`}>
                                        {statusText}
                                        {record.lateStatus?.isLate && computedStatus !== 'PENDING' && <span className="ml-1 text-red-600 font-extrabold">• LATE</span>}
                                    </span>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <span className="text-green-600 font-bold">₹{wageRec.breakdown.total}</span>
                                    <p className="text-[10px] text-gray-400">Daily Pay</p>
                                    
                                    {(profile?.role === 'FACTORY_OWNER' || profile?.role === 'SUPERVISOR') && (
                                      <button 
                                        onClick={() => openRegulationModal(record)}
                                        className="mt-2 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded flex items-center transition-colors"
                                      >
                                        <Edit size={10} className="mr-1" /> Regulate
                                      </button>
                                    )}
                                </div>
                            </div>

                            {/* Detailed Expandable Timeline */}
                            {sortedTimeline.length > 0 && (
                                <div className="bg-gray-50 p-3 rounded-lg text-xs mt-3 border border-gray-100">
                                   <div 
                                      className={`flex justify-between items-center text-gray-700 font-bold cursor-pointer ${isExpanded ? 'border-b border-gray-200 pb-2 mb-2' : ''}`}
                                      onClick={() => toggleExpand(record.id)}
                                   >
                                       <div className="flex items-center space-x-2">
                                           <span>Net: {displayHours.toFixed(1)} hrs</span>
                                           <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded-full text-gray-600">{sortedTimeline.length} Punches</span>
                                           {record.hours?.overtime > 0 && <span className="text-orange-500 font-bold ml-2">(+{record.hours.overtime} OT)</span>}
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

                {attendanceHistory.length === 0 && (
                    <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                        <AlertCircle className="mx-auto mb-2 opacity-50" />
                        <p>No records found for this month.</p>
                    </div>
                )}
            </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Search size={48} className="mb-4 opacity-20" />
            <p>Select a worker to view history</p>
        </div>
      )}

      {/* REGULATION MODAL */}
      {editingRecord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-800">Regulate Missed Punch</h3>
              <button onClick={() => setEditingRecord(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 mb-4">
              Modify the punch for <span className="font-bold">{new Date(editingRecord.date).toLocaleDateString()}</span>. This will replace the existing punch and recalculate the worker's hours.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Which Punch to Modify?</label>
                <div className="flex space-x-2 mt-1">
                  <button 
                    onClick={() => setRegulateType('IN')}
                    className={`flex-1 py-2 rounded-lg font-bold text-sm border transition-colors ${regulateType === 'IN' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-500'}`}
                  >
                    Check IN
                  </button>
                  <button 
                    onClick={() => setRegulateType('OUT')}
                    className={`flex-1 py-2 rounded-lg font-bold text-sm border transition-colors ${regulateType === 'OUT' ? 'bg-red-50 border-red-500 text-red-700' : 'border-gray-200 text-gray-500'}`}
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
                  className="w-full p-3 mt-1 bg-gray-50 border border-gray-200 rounded-lg outline-none font-bold"
                />
              </div>
            </div>

            <button
              onClick={handleSaveRegulation}
              disabled={savingRegulation}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex justify-center items-center disabled:opacity-50 transition-colors"
            >
              {savingRegulation ? 'Saving...' : <><PlusCircle size={18} className="mr-2" /> Save Regulation</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};