import React, { useState, useMemo, useEffect } from 'react';
import { IndianRupee, FileText, Download } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { wageService } from '../services/wageService';
import { MonthlyPayroll, Worker, DailyWageRecord, Advance } from '../types/index';
import { Payslip } from '../components/Payslip';

export const PayrollScreen: React.FC = () => {
  const { profile } = useAuth();
  const [selectedPayroll, setSelectedPayroll] = useState<MonthlyPayroll | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [dailyWages, setDailyWages] = useState<DailyWageRecord[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]); // New State
  const [loading, setLoading] = useState(true);
  
  const currentMonthStr = new Date().toISOString().slice(0, 7); // 2023-10

  useEffect(() => {
    const loadData = async () => {
      if (profile?.tenantId) {
        try {
          // Fetch Workers, Attendance, AND Advances
          const [fetchedWorkers, fetchedAttendance, fetchedAdvances] = await Promise.all([
            dbService.getWorkers(profile.tenantId),
            dbService.getAttendanceHistory(profile.tenantId),
            dbService.getAdvances(profile.tenantId)
          ]);
          
          setWorkers(fetchedWorkers);
          setAdvances(fetchedAdvances);
          
          // Calculate daily wages from attendance history
          const wages: DailyWageRecord[] = [];
          fetchedAttendance.forEach(record => {
             const worker = fetchedWorkers.find(w => w.id === record.workerId);
             if (worker) wages.push(wageService.calculateDailyWage(worker, record));
          });
          setDailyWages(wages);
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }
    };
    loadData();
  }, [profile]);

  // Generate Payroll Data
  const payrolls = useMemo(() => {
    if (workers.length === 0) return [];
    
    // Pass the fetched advances here (Arg #4)
    return workers.map(worker => 
        wageService.generateMonthlyPayroll(worker, currentMonthStr, dailyWages, advances)
    );
  }, [workers, dailyWages, advances, currentMonthStr]);

  const totalPayout = payrolls.reduce((acc, p) => acc + p.netPayable, 0);
  const totalDeductions = payrolls.reduce((acc, p) => acc + p.deductions.total, 0);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <div className="p-4 bg-gray-50 min-h-full pb-24">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Payroll Review</h2>
        <p className="text-gray-500 text-sm">For {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 uppercase font-bold">Total Net Pay</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">₹{(totalPayout/1000).toFixed(1)}k</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 uppercase font-bold">Deductions</p>
            <p className="text-2xl font-bold text-red-500 mt-1">₹{(totalDeductions/1000).toFixed(1)}k</p>
        </div>
      </div>

      {/* Payroll List */}
      <div className="space-y-3">
        {payrolls.map(payroll => (
            <div key={payroll.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div 
                    onClick={() => setSelectedPayroll(payroll)}
                    className="p-4 active:bg-gray-50 cursor-pointer transition-colors"
                >
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-full overflow-hidden flex items-center justify-center font-bold text-gray-500">
                                {payroll.workerName.charAt(0)}
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-800">{payroll.workerName}</h3>
                                <div className="flex space-x-2 text-xs text-gray-500">
                                    <span>{payroll.attendanceSummary.presentDays} Days</span>
                                    <span>•</span>
                                    <span>{payroll.attendanceSummary.totalOvertimeHours}h OT</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-bold text-gray-900">₹{payroll.netPayable.toLocaleString()}</p>
                            <p className="text-[10px] text-gray-400 uppercase">Net Payable</p>
                        </div>
                    </div>
                    
                    {/* Mini Details */}
                    <div className="mt-3 flex justify-between text-xs text-gray-500 bg-gray-50 p-2 rounded-lg">
                        <span>Basic: ₹{payroll.earnings.basic}</span>
                        <span>OT: ₹{payroll.earnings.overtime}</span>
                        <span className="text-red-500 font-bold">Ded: -₹{payroll.deductions.total}</span>
                    </div>
                </div>
            </div>
        ))}
      </div>

      {/* Payslip Modal */}
      {selectedPayroll && (
        <Payslip data={selectedPayroll} onClose={() => setSelectedPayroll(null)} />
      )}
    </div>
  );
};