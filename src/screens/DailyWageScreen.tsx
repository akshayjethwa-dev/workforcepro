import React, { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock, IndianRupee } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { wageService } from '../services/wageService';
import { DailyWageRecord, Worker, Advance } from '../types/index';

export const DailyWageScreen: React.FC = () => {
  const { profile } = useAuth();
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [dailyWages, setDailyWages] = useState<DailyWageRecord[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [loading, setLoading] = useState(true);

  // Default to current month to match other payroll features
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    const loadData = async () => {
      if (profile?.tenantId) {
        try {
          const [fetchedWorkers, fetchedAttendance, fetchedAdvances] = await Promise.all([
            dbService.getWorkers(profile.tenantId),
            dbService.getAttendanceHistory(profile.tenantId),
            dbService.getAdvances(profile.tenantId)
          ]);
          
          setWorkers(fetchedWorkers);
          setAdvances(fetchedAdvances);

          // Calculate Wages on the fly based on Attendance
          const calculatedWages: DailyWageRecord[] = [];
          fetchedAttendance.forEach(record => {
             const worker = fetchedWorkers.find(w => w.id === record.workerId);
             if (worker) {
                 calculatedWages.push(wageService.calculateDailyWage(worker, record));
             }
          });
          
          setDailyWages(calculatedWages);
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }
    };
    loadData();
  }, [profile]);

  if (loading) return <div className="p-8 text-center">Loading Wages...</div>;

  // If a worker is selected, show their daily logs & ledger
  if (selectedWorkerId) {
    const worker = workers.find(w => w.id === selectedWorkerId);
    
    // Filter by selected month
    const workerWages = dailyWages.filter(w => w.workerId === selectedWorkerId && w.date.startsWith(selectedMonth));
    const workerAdvances = advances.filter(a => a.workerId === selectedWorkerId && a.date.startsWith(selectedMonth));
    
    // Sort by date desc
    workerWages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const totalGross = workerWages.reduce((acc, curr) => acc + curr.breakdown.total, 0);
    const totalAdvances = workerAdvances.reduce((acc, curr) => acc + curr.amount, 0);
    const netTotal = Math.max(0, totalGross - totalAdvances);

    return (
      <div className="p-4 bg-gray-50 min-h-full">
        <div className="flex items-center mb-6 justify-between">
          <div className="flex items-center">
             <button onClick={() => setSelectedWorkerId(null)} className="p-2 -ml-2 hover:bg-gray-200 rounded-full">
               <ChevronLeft size={24} />
             </button>
             <div className="ml-2">
               <h2 className="font-bold text-lg text-gray-800">{worker?.name}</h2>
               <p className="text-xs text-gray-500">{worker?.designation}</p>
             </div>
          </div>
          <input 
              type="month" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)} 
              className="text-sm border border-gray-200 rounded-lg p-2 font-bold outline-none shadow-sm"
          />
        </div>

        {/* Summary Card */}
        <div className="bg-blue-600 rounded-xl p-4 text-white shadow-lg mb-6">
          <p className="text-blue-100 text-xs font-bold uppercase">Net Earnings ({new Date(selectedMonth).toLocaleString('default', { month: 'short' })})</p>
          <div className="flex items-end mt-1">
            <span className="text-3xl font-bold">₹{netTotal.toLocaleString()}</span>
          </div>
          {totalAdvances > 0 && (
             <p className="text-[10px] text-blue-200 mt-1 font-medium">
                Gross: ₹{totalGross.toLocaleString()} - Advances: ₹{totalAdvances.toLocaleString()}
             </p>
          )}

          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-blue-500/30">
             <div>
                <p className="text-blue-200 text-xs">Total Hours</p>
                <p className="font-bold">{workerWages.reduce((acc, curr) => acc + curr.meta.hoursWorked, 0).toFixed(1)} hrs</p>
             </div>
             <div>
                <p className="text-blue-200 text-xs">Overtime Pay</p>
                <p className="font-bold">₹{workerWages.reduce((acc, curr) => acc + curr.breakdown.overtimeWage, 0)}</p>
             </div>
          </div>
        </div>

        {/* Advances Ledger */}
        {workerAdvances.length > 0 && (
            <div className="bg-white p-4 rounded-xl shadow-sm border border-orange-100 mb-6">
                 <h3 className="font-bold text-gray-700 mb-3 text-sm flex items-center">
                    <IndianRupee size={16} className="mr-1 text-orange-500"/> Advances Taken
                 </h3>
                 <div className="space-y-2">
                    {workerAdvances.map(adv => (
                       <div key={adv.id} className="flex justify-between items-center text-sm border-b border-gray-50 pb-2">
                          <div>
                             <p className="font-bold text-gray-800">{new Date(adv.date).toLocaleDateString()}</p>
                             <p className="text-xs text-gray-500">{adv.reason}</p>
                          </div>
                          <span className="font-bold text-red-500">-₹{adv.amount}</span>
                       </div>
                    ))}
                 </div>
            </div>
        )}

        <h3 className="font-bold text-gray-700 mb-4 flex items-center">
            <Calendar size={18} className="mr-2"/> Daily Breakdown
        </h3>
        
        <div className="space-y-3 pb-24">
           {workerWages.length === 0 && <p className="text-gray-400 text-center py-8">No records found for {selectedMonth}.</p>}
           
           {workerWages.map(record => (
             <div key={record.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
               <div className="flex justify-between items-start mb-2">
                 <div>
                    <span className="text-gray-900 font-bold">{new Date(record.date).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', weekday: 'short'})}</span>
                    <div className="flex items-center text-xs text-gray-500 mt-1">
                       <Clock size={12} className="mr-1" />
                       {record.meta.hoursWorked} hrs
                       {record.meta.overtimeHours > 0 && <span className="ml-2 text-orange-600 font-bold">(+{record.meta.overtimeHours} OT)</span>}
                    </div>
                 </div>
                 <div className="text-right">
                    <span className="text-green-600 font-bold text-lg">₹{record.breakdown.total}</span>
                 </div>
               </div>
               
               {/* Mini breakdown */}
               <div className="flex gap-2 text-[10px] text-gray-400 bg-gray-50 p-2 rounded-lg mt-2">
                  <div className="flex-1 text-center">
                     <p>Base</p>
                     <p className="text-gray-700 font-medium">₹{record.breakdown.baseWage}</p>
                  </div>
                  <div className="flex-1 text-center border-l border-gray-200">
                     <p>OT</p>
                     <p className="text-gray-700 font-medium">₹{record.breakdown.overtimeWage}</p>
                  </div>
                  <div className="flex-1 text-center border-l border-gray-200">
                     <p>Allow</p>
                     <p className="text-gray-700 font-medium">₹{record.breakdown.allowances}</p>
                  </div>
               </div>
             </div>
           ))}
        </div>
      </div>
    );
  }

  // List of all workers
  return (
    <div className="p-4 bg-gray-50 min-h-full pb-24">
      <div className="flex justify-between items-center mb-6">
         <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Wage Logs</h2>
            <p className="text-sm text-gray-500">Select a worker to view daily calculations</p>
         </div>
         <input 
              type="month" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)} 
              className="text-sm border border-gray-200 rounded-lg p-2 font-bold outline-none shadow-sm"
         />
      </div>

      <div className="space-y-3">
        {workers.map(worker => {
            // Filter both wages and advances by the selected month
            const workerGross = dailyWages
                .filter(w => w.workerId === worker.id && w.date.startsWith(selectedMonth))
                .reduce((acc, curr) => acc + curr.breakdown.total, 0);
                
            const workerAdvances = advances
                .filter(a => a.workerId === worker.id && a.date.startsWith(selectedMonth))
                .reduce((acc, curr) => acc + curr.amount, 0);
                
            const workerNet = Math.max(0, workerGross - workerAdvances);

            return (
              <button 
                key={worker.id} 
                onClick={() => setSelectedWorkerId(worker.id)}
                className="w-full bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                  {worker.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-800">{worker.name}</h3>
                  <p className="text-xs text-gray-500">{worker.designation}</p>
                </div>
                <div className="text-right">
                   <p className="text-xs text-gray-400">Est. Net</p>
                   <p className="text-sm font-bold text-green-600">₹{workerNet.toLocaleString()}</p>
                </div>
                <ChevronRight size={16} className="text-gray-300" />
              </button>
            );
        })}
      </div>
    </div>
  );
};