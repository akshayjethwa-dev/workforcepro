import React, { useState, useMemo } from 'react';
import { IndianRupee, FileText, CheckCircle, Download, AlertTriangle } from 'lucide-react';
import { storageService } from '../services/storage';
import { wageService } from '../services/wageService';
import { MonthlyPayroll } from '../types';
import { Payslip } from '../components/Payslip';

export const PayrollScreen: React.FC = () => {
  const [selectedPayroll, setSelectedPayroll] = useState<MonthlyPayroll | null>(null);
  const workers = storageService.getWorkers();
  const dailyWages = storageService.getDailyWages();
  const advances = storageService.getAdvances();
  
  const currentMonthStr = new Date().toISOString().slice(0, 7); // 2023-10

  // Generate Payroll Data on fly (in real app, this would be fetched from DB)
  const payrolls = useMemo(() => {
    return workers.map(worker => 
        wageService.generateMonthlyPayroll(worker, currentMonthStr, dailyWages, advances)
    );
  }, [workers, dailyWages, advances, currentMonthStr]);

  const totalPayout = payrolls.reduce((acc, p) => acc + p.netPayable, 0);
  const totalDeductions = payrolls.reduce((acc, p) => acc + p.deductions.total, 0);
  const totalEmployees = payrolls.length;

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

      {/* Action Bar */}
      <div className="flex gap-2 mb-4">
        <button className="flex-1 bg-gray-800 text-white py-3 rounded-lg text-sm font-bold flex items-center justify-center shadow-lg">
             <CheckCircle size={16} className="mr-2" /> Approve & Lock
        </button>
        <button className="flex-1 bg-white text-gray-700 border border-gray-200 py-3 rounded-lg text-sm font-bold flex items-center justify-center">
             <Download size={16} className="mr-2" /> Bank File
        </button>
      </div>

      {/* Payroll List */}
      <div className="space-y-3">
        {payrolls.map(payroll => (
            <div key={payroll.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div 
                    onClick={() => setSelectedPayroll(payroll)}
                    className="p-4 active:bg-gray-50 cursor-pointer"
                >
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-full overflow-hidden">
                                <img src={`https://ui-avatars.com/api/?name=${payroll.workerName}&background=random`} alt="" className="w-full h-full object-cover" />
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
                    
                    {/* Mini table */}
                    <div className="mt-3 bg-gray-50 rounded-lg p-2 flex text-xs justify-between text-gray-600">
                         <div>
                            <span className="block text-gray-400 text-[10px]">Gross</span>
                            <span className="font-semibold">₹{payroll.earnings.gross}</span>
                         </div>
                         <div className="text-center">
                            <span className="block text-gray-400 text-[10px]">Deductions</span>
                            <span className="font-semibold text-red-500">-₹{payroll.deductions.total}</span>
                         </div>
                         <div className="text-right flex items-center text-blue-600 font-bold">
                             View Slip <FileText size={12} className="ml-1" />
                         </div>
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
