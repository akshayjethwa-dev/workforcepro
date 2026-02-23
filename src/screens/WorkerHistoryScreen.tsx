// src/screens/WorkerHistoryScreen.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Search, ArrowRight, Clock, AlertCircle, Edit, X, PlusCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { wageService } from '../services/wageService';
import { attendanceLogic } from '../services/attendanceLogic';
import { Worker, AttendanceRecord, Punch } from '../types/index';

export const WorkerHistoryScreen: React.FC = () => {
  const { profile } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Regulation Modal State
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [regulateType, setRegulateType] = useState<'IN' | 'OUT'>('OUT');
  const [regulateTime, setRegulateTime] = useState<string>('18:00');
  const [savingRegulation, setSavingRegulation] = useState(false);

  // 1. Load Workers on Mount
  useEffect(() => {
    if (profile?.tenantId) {
      dbService.getWorkers(profile.tenantId).then(data => {
        setWorkers(data);
        setLoading(false);
      });
    }
  }, [profile]);

  // 2. Load Attendance when Worker or Month changes
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
    } else {
        setAttendanceHistory([]);
    }
  }, [selectedWorkerId, selectedMonth, profile]);

  const selectedWorker = workers.find(w => w.id === selectedWorkerId);

  // 3. Calculate Summary Stats
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

    return { totalEarning, presentDays, halfDays, absentDays, lateDays, totalOT, count: attendanceHistory.length };
  }, [attendanceHistory, selectedWorker]);

  // 4. Handle Regulating a Missed Punch
  const handleSaveRegulation = async () => {
    if (!editingRecord || !profile?.tenantId || !selectedWorker) return;
    setSavingRegulation(true);

    try {
      // Create the new manual punch
      const timestamp = new Date(`${editingRecord.date}T${regulateTime}:00`).toISOString();
      const newPunch: Punch = {
        timestamp,
        type: regulateType,
        device: 'MANUAL_OVERRIDE_BY_ADMIN'
      };

      // Add to timeline
      const updatedTimeline = [...(editingRecord.timeline || []), newPunch];

      // Fetch requirements to recalculate status
      const settings = await dbService.getOrgSettings(profile.tenantId);
      const shift = settings.shifts.find(s => s.id === selectedWorker.shiftId) || settings.shifts[0];
      const lateCount = await dbService.getMonthlyLateCount(profile.tenantId, selectedWorker.id);

      // Create draft record
      const draftRecord: AttendanceRecord = {
        ...editingRecord,
        timeline: updatedTimeline
      };

      // Recalculate everything using the exact same engine
      const finalRecord = attendanceLogic.processDailyStatus(
        draftRecord, 
        shift, 
        lateCount, 
        settings.enableBreakTracking
      );

      // Save to DB
      await dbService.markAttendanceOnline(finalRecord);

      // Update Local State
      setAttendanceHistory(prev => prev.map(r => r.id === finalRecord.id ? finalRecord : r));
      setEditingRecord(null);

    } catch (error) {
      console.error("Failed to regulate punch:", error);
      alert("Failed to save the regulated punch.");
    } finally {
      setSavingRegulation(false);
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
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg outline-none appearance-none"
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
                className="w-full p-3 mt-1 bg-gray-50 border border-gray-200 rounded-lg outline-none"
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
                                <p className="text-blue-100 text-xs font-bold uppercase">Estimated Earnings</p>
                                <h3 className="text-3xl font-bold mt-1">₹{summary.totalEarning.toLocaleString()}</h3>
                            </div>
                            <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm">
                                <Calendar className="text-white" size={24} />
                            </div>
                        </div>
                        
                        {/* 4-Column Grid for Stats */}
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

            {/* Daily List */}
            <h3 className="font-bold text-gray-700 mb-3 text-sm">Daily Records ({attendanceHistory.length})</h3>
            
            <div className="space-y-3">
                {attendanceHistory.map(record => {
                    // Re-calc wage for display
                    const wageRec = wageService.calculateDailyWage(selectedWorker!, record);
                    
                    // Format times
                    const checkIn = record.timeline?.find(p => p.type === 'IN');
                    const checkOut = record.timeline?.slice().reverse().find(p => p.type === 'OUT');
                    
                    return (
                        <div key={record.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <span className="font-bold text-gray-900 block">
                                        {new Date(record.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                                    </span>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1 ${
                                        record.status === 'PRESENT' ? 'bg-green-100 text-green-700' :
                                        record.status === 'HALF_DAY' ? 'bg-orange-100 text-orange-700' :
                                        'bg-red-100 text-red-700'
                                    }`}>
                                        {record.status.replace('_', ' ')}
                                        {record.lateStatus?.isLate && <span className="ml-1 text-red-600 font-extrabold">• LATE</span>}
                                    </span>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <span className="text-green-600 font-bold">₹{wageRec.breakdown.total}</span>
                                    <p className="text-[10px] text-gray-400">Daily Pay</p>
                                    
                                    {/* Regulate Button */}
                                    {(profile?.role === 'FACTORY_OWNER' || profile?.role === 'SUPERVISOR') && (
                                      <button 
                                        onClick={() => setEditingRecord(record)}
                                        className="mt-2 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded flex items-center"
                                      >
                                        <Edit size={10} className="mr-1" /> Regulate
                                      </button>
                                    )}
                                </div>
                            </div>

                            {/* Timeline Bar */}
                            <div className="bg-gray-50 rounded-lg p-2 mt-2 flex justify-between items-center text-xs">
                                <div className="flex items-center text-gray-600">
                                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                                    {checkIn ? new Date(checkIn.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}
                                </div>
                                <ArrowRight size={12} className="text-gray-300"/>
                                <div className="flex items-center text-gray-600">
                                    {checkOut ? new Date(checkOut.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}
                                    <div className="w-2 h-2 bg-red-500 rounded-full ml-2"></div>
                                </div>
                            </div>

                            {/* Hours */}
                            <div className="flex items-center justify-end mt-2 text-xs text-gray-400">
                                <Clock size={12} className="mr-1"/>
                                {record.hours?.net.toFixed(1)} hrs worked
                                {record.hours?.overtime > 0 && <span className="ml-2 text-orange-500 font-bold">(+{record.hours.overtime} OT)</span>}
                            </div>
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
              Add a manual punch for <span className="font-bold">{new Date(editingRecord.date).toLocaleDateString()}</span>. This will recalculate the worker's hours and wages automatically.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Punch Type</label>
                <div className="flex space-x-2 mt-1">
                  <button 
                    onClick={() => setRegulateType('IN')}
                    className={`flex-1 py-2 rounded-lg font-bold text-sm border ${regulateType === 'IN' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-500'}`}
                  >
                    Check IN
                  </button>
                  <button 
                    onClick={() => setRegulateType('OUT')}
                    className={`flex-1 py-2 rounded-lg font-bold text-sm border ${regulateType === 'OUT' ? 'bg-red-50 border-red-500 text-red-700' : 'border-gray-200 text-gray-500'}`}
                  >
                    Check OUT
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Manual Time</label>
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
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex justify-center items-center disabled:opacity-50"
            >
              {savingRegulation ? 'Saving...' : <><PlusCircle size={18} className="mr-2" /> Add Punch & Recalculate</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};