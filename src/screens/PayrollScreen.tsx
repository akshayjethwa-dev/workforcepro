import React, { useState, useMemo, useEffect } from 'react';
import { IndianRupee, FileText, Download, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { wageService } from '../services/wageService';
import { MonthlyPayroll, Worker, AttendanceRecord, Advance } from '../types/index';
import { Payslip } from '../components/Payslip';

export const PayrollScreen: React.FC = () => {
  const { profile } = useAuth();
  const [selectedPayroll, setSelectedPayroll] = useState<MonthlyPayroll | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  
  const [savedPayrolls, setSavedPayrolls] = useState<MonthlyPayroll[]>([]); 
  const [siteAddress, setSiteAddress] = useState<string>(''); 
  
  const [loading, setLoading] = useState(true);
  
  const currentMonthStr = new Date().toISOString().slice(0, 7); 

  useEffect(() => {
    const loadData = async () => {
      if (!profile?.tenantId) return;
      
      try {
        const fetchedWorkers = await dbService.getWorkers(profile.tenantId);
        const fetchedAttendance = await dbService.getAttendanceHistory(profile.tenantId);
        const fetchedAdvances = await dbService.getAdvances(profile.tenantId);
        const fetchedSettings = await dbService.getOrgSettings(profile.tenantId);
        
        let fetchedPayrolls: MonthlyPayroll[] = [];
        try {
           fetchedPayrolls = await dbService.getPayrollsByMonth(profile.tenantId, currentMonthStr);
        } catch (payrollErr) {
           console.warn("Could not load saved payrolls. Check Firestore Rules for the 'payrolls' collection.", payrollErr);
        }

        setWorkers(fetchedWorkers);
        setAdvances(fetchedAdvances);
        setSiteAddress(fetchedSettings.baseLocation?.address || '');
        setSavedPayrolls(fetchedPayrolls);
        setAttendanceHistory(fetchedAttendance);

      } catch (e) {
        console.error("Critical error loading data:", e);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [profile, currentMonthStr]);

  // Generate Payroll Data
  const payrolls = useMemo(() => {
    if (workers.length === 0) return [];
    
    return workers.map(worker => {
        const savedPayroll = savedPayrolls.find(p => p.workerId === worker.id);
        if (savedPayroll) return savedPayroll;

        return wageService.generateMonthlyPayroll(worker, currentMonthStr, attendanceHistory, advances);
    });
  }, [workers, attendanceHistory, advances, currentMonthStr, savedPayrolls]);

  // Handler for marking a salary as paid
  const handleMarkAsPaid = async (payroll: MonthlyPayroll, e: React.MouseEvent) => {
    e.stopPropagation(); 
    
    if (window.confirm(`Mark ₹${payroll.netPayable} as paid to ${payroll.workerName}?`)) {
      try {
        const updatedPayroll: MonthlyPayroll = { ...payroll, status: 'PAID' };
        await dbService.savePayroll(updatedPayroll);
        
        setSavedPayrolls(prev => {
          const exists = prev.find(p => p.id === updatedPayroll.id);
          if (exists) return prev.map(p => p.id === updatedPayroll.id ? updatedPayroll : p);
          return [...prev, updatedPayroll];
        });
      } catch (error) {
        console.error("Failed to mark as paid", error);
        alert("Failed to save to database. If this persists, please check your Firestore Security Rules to ensure writes to 'payrolls' are allowed.");
      }
    }
  };

  const pendingPayout = payrolls.filter(p => p.status !== 'PAID').reduce((acc, p) => acc + p.netPayable, 0);
  const paidPayout = payrolls.filter(p => p.status === 'PAID').reduce((acc, p) => acc + p.netPayable, 0);

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
            <p className="text-xs text-gray-500 uppercase font-bold">Pending Payout</p>
            <p className="text-2xl font-bold text-orange-500 mt-1">₹{(pendingPayout/1000).toFixed(1)}k</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 uppercase font-bold">Total Paid</p>
            <p className="text-2xl font-bold text-green-600 mt-1">₹{(paidPayout/1000).toFixed(1)}k</p>
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
                                <div className="flex space-x-2 text-xs mt-1 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                                    <span className="text-green-600 font-bold">{payroll.attendanceSummary.presentDays} P</span>
                                    {payroll.attendanceSummary.halfDays > 0 && <span className="text-orange-500 font-bold">• {payroll.attendanceSummary.halfDays} HD</span>}
                                    {payroll.attendanceSummary.absentDays > 0 && <span className="text-red-500 font-bold">• {payroll.attendanceSummary.absentDays} A</span>}
                                    <span className="text-gray-400">•</span>
                                    <span className="text-gray-600 font-bold">{payroll.attendanceSummary.totalOvertimeHours}h OT</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-bold text-gray-900">₹{payroll.netPayable.toLocaleString()}</p>
                            
                            {payroll.status === 'PAID' ? (
                                <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full mt-1">
                                    <CheckCircle size={10} />
                                    <span>PAID</span>
                                </span>
                            ) : (
                                <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-orange-500 bg-orange-50 px-2 py-1 rounded-full mt-1">
                                    <Clock size={10} />
                                    <span>PENDING</span>
                                </span>
                            )}
                        </div>
                    </div>
                    
                    <div className="mt-3 flex items-center justify-between">
                        <div className="flex space-x-3 text-xs text-gray-500 bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100">
                            <span>Base: ₹{payroll.earnings.basic}</span>
                            <span className="text-red-500">Ded: -₹{payroll.deductions.total}</span>
                        </div>
                        
                        {payroll.status !== 'PAID' && (
                            <button 
                                onClick={(e) => handleMarkAsPaid(payroll, e)}
                                className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                Mark as Paid
                            </button>
                        )}
                    </div>
                </div>
            </div>
        ))}
        {payrolls.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-500">
             No workers found for this location.
          </div>
        )}
      </div>

      {/* Payslip Modal */}
      {selectedPayroll && (
        <Payslip 
            data={selectedPayroll} 
            companyName={profile?.companyName || 'Factory Admin'}
            siteAddress={siteAddress}
            onClose={() => setSelectedPayroll(null)} 
        />
      )}
    </div>
  );
};