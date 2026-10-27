import React, { useState, useEffect } from 'react';
import { 
  Calendar, ChevronLeft, ChevronRight, Clock, IndianRupee, Search, 
  ArrowLeft, TrendingUp, AlertCircle, User, Sparkles, Filter, X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import { wageService } from '../services/wageService';
import { DailyWageRecord, Worker, Advance, OrgSettings } from '../types/index';

export const DailyWageScreen: React.FC = () => {
  const { profile } = useAuth();
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [dailyWages, setDailyWages] = useState<DailyWageRecord[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    const loadData = async () => {
      if (profile?.tenantId) {
        try {
          const [fetchedWorkers, fetchedAttendance, fetchedAdvances, fetchedSettings] = await Promise.all([
            dbService.getWorkers(profile.tenantId),
            dbService.getAttendanceHistory(profile.tenantId),
            dbService.getAdvances(profile.tenantId),
            dbService.getOrgSettings(profile.tenantId)
          ]);
          
          setWorkers(fetchedWorkers);
          setAdvances(fetchedAdvances);
          setSettings(fetchedSettings);

          const calculatedWages: DailyWageRecord[] = [];
          fetchedAttendance.forEach(record => {
             const worker = fetchedWorkers.find(w => w.id === record.workerId);
             if (worker) {
                 calculatedWages.push(wageService.calculateDailyWage(worker, record, fetchedSettings));
             }
          });
          
          setDailyWages(calculatedWages);
        } catch (e) {
          console.error("Error loading daily wage data", e);
        } finally {
          setLoading(false);
        }
      }
    };
    loadData();
  }, [profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // --- DRILL DOWN VIEW FOR A SPECIFIC WORKER ---
  if (selectedWorkerId) {
    const worker = workers.find(w => w.id === selectedWorkerId);
    
    const workerWages = dailyWages.filter(w => w.workerId === selectedWorkerId && w.date.startsWith(selectedMonth));
    const workerAdvances = advances.filter(a => a.workerId === selectedWorkerId && a.date.startsWith(selectedMonth));
    
    workerWages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const totalGross = workerWages.reduce((acc, curr) => acc + curr.breakdown.total, 0);
    const totalAdvances = workerAdvances.reduce((acc, curr) => acc + curr.amount, 0);
    const netTotal = Math.max(0, totalGross - totalAdvances);
    const totalHours = workerWages.reduce((acc, curr) => acc + curr.meta.hoursWorked, 0);
    const totalOTHours = workerWages.reduce((acc, curr) => acc + curr.meta.overtimeHours, 0);
    const totalOTPay = workerWages.reduce((acc, curr) => acc + curr.breakdown.overtimeWage, 0);

    return (
      <div className="space-y-6 pb-12">
        {/* TOP BREADCRUMB & MONTH TOOLBAR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSelectedWorkerId(null)} 
              className="p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-xl transition-all active:scale-95"
              title="Back to all wage logs"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">{worker?.name}</h1>
                <span className="text-xs text-slate-400 font-normal">· {worker?.designation || 'Staff'}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Daily calculation sheets & advance deductions
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <input 
              type="month" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)} 
              className="bg-white border border-slate-200 text-xs font-semibold text-slate-700 py-2 px-3 rounded-xl shadow-xs outline-none focus:border-blue-600 transition-colors cursor-pointer"
            />
          </div>
        </div>

        {/* WORKER EARNINGS HERO CARD */}
        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xs border border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Net Payable for {new Date(selectedMonth + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
              <div className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums text-white mt-1">
                ₹{netTotal.toLocaleString()}
              </div>
              {totalAdvances > 0 && (
                <div className="text-xs text-slate-400 mt-1.5 flex items-center gap-2">
                  <span>Gross: ₹{totalGross.toLocaleString()}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-rose-400">Advances: -₹{totalAdvances.toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 text-left sm:text-right border-t sm:border-t-0 sm:border-l border-slate-800 pt-4 sm:pt-0 sm:pl-6">
              <div>
                <span className="text-[11px] text-slate-400 block">Days Worked</span>
                <span className="font-mono font-bold text-sm text-white tabular-nums">{workerWages.length}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Total Hours</span>
                <span className="font-mono font-bold text-sm text-white tabular-nums">{totalHours.toFixed(1)} h</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Overtime Pay</span>
                <span className="font-mono font-bold text-sm text-amber-400 tabular-nums">₹{totalOTPay.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ADVANCES RECORDED (KHARCHI) */}
        {workerAdvances.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 sm:px-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <IndianRupee size={16} className="text-amber-600" />
                <h3 className="font-bold text-slate-900 text-sm">Advances & Deductions (Kharchi)</h3>
              </div>
              <span className="text-xs font-mono font-semibold text-rose-600 tabular-nums">
                -₹{totalAdvances.toLocaleString()} total
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {workerAdvances.map(adv => (
                <div key={adv.id} className="p-4 sm:px-6 flex items-center justify-between hover:bg-slate-50/70 transition-colors">
                  <div>
                    <span className="font-bold text-xs text-slate-900">
                      {new Date(adv.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="text-xs text-slate-500 ml-2">· {adv.reason || 'General Kharchi'}</span>
                  </div>
                  <span className="font-mono font-bold text-sm text-rose-600 tabular-nums">
                    -₹{adv.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DAILY BREAKDOWN CARDS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={17} className="text-blue-600" />
              <h3 className="font-bold text-slate-900 text-sm">Daily Calculations</h3>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {workerWages.length} shift logs
            </span>
          </div>

          {workerWages.length === 0 ? (
            <div className="p-10 bg-white rounded-2xl border border-slate-200/80 text-center text-slate-400">
              <Calendar size={28} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">No shift records found for this month</p>
              <p className="text-xs text-slate-400 mt-1">Attendance punches recorded for this worker will automatically generate wage cards.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {workerWages.map(record => (
                <div 
                  key={record.id} 
                  className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {new Date(record.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5 font-mono tabular-nums">
                        <Clock size={12} className="text-slate-400" />
                        <span>{record.meta.hoursWorked.toFixed(1)} hrs worked</span>
                        {record.meta.overtimeHours > 0 && (
                          <span className="text-amber-600 font-semibold">
                            (+{record.meta.overtimeHours.toFixed(1)}h OT)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block font-sans">Daily Net</span>
                      <span className="font-mono font-extrabold text-base text-slate-900 tabular-nums">
                        ₹{record.breakdown.total.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Component Breakdown Row */}
                  <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-[11px] font-mono tabular-nums text-slate-600">
                    <div>
                      <span className="text-slate-400 block text-[10px] font-sans">Base Pay</span>
                      <span className="font-bold text-slate-800">₹{record.breakdown.baseWage.toLocaleString()}</span>
                    </div>
                    <div className="border-l border-slate-100 pl-2">
                      <span className="text-slate-400 block text-[10px] font-sans">OT Pay</span>
                      <span className={`font-bold ${record.breakdown.overtimeWage > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                        ₹{record.breakdown.overtimeWage.toLocaleString()}
                      </span>
                    </div>
                    <div className="border-l border-slate-100 pl-2">
                      <span className="text-slate-400 block text-[10px] font-sans">Allowances</span>
                      <span className="font-bold text-slate-800">₹{record.breakdown.allowances.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- SUMMARY METRICS FOR ALL WORKERS ---
  const filteredWorkers = workers.filter(w => 
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.phone.includes(searchTerm) ||
    (w.designation && w.designation.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const monthWages = dailyWages.filter(w => w.date.startsWith(selectedMonth));
  const monthAdvances = advances.filter(a => a.date.startsWith(selectedMonth));

  const totalGrossMonth = monthWages.reduce((acc, curr) => acc + curr.breakdown.total, 0);
  const totalAdvancesMonth = monthAdvances.reduce((acc, curr) => acc + curr.amount, 0);
  const totalNetMonth = Math.max(0, totalGrossMonth - totalAdvancesMonth);
  const totalOTPayMonth = monthWages.reduce((acc, curr) => acc + curr.breakdown.overtimeWage, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Daily Wage Calculations</h1>
          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
            <span>Shift-based wage rates, overtime & advance deductions</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-slate-600">
              {new Date(selectedMonth + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <input 
            type="month" 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)} 
            className="bg-white border border-slate-200 text-xs font-semibold text-slate-700 py-2 px-3 rounded-xl shadow-xs outline-none focus:border-blue-600 transition-colors cursor-pointer"
          />
        </div>
      </div>

      {/* MONTH SUMMARY KPIS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Net Wage Accrued</span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-2">
            ₹{totalNetMonth.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">After advance deductions</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Gross Accrual</span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-blue-600 mt-2">
            ₹{totalGrossMonth.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Pre-deduction earnings</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overtime Accrued</span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-amber-600 mt-2">
            ₹{totalOTPayMonth.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Extra shift hours</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Advances (Kharchi)</span>
          <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-rose-600 mt-2">
            ₹{totalAdvancesMonth.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Deducted from net pay</p>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 text-slate-400" size={17} />
        <input 
          type="text" 
          placeholder="Search worker by name, role, or phone..." 
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all shadow-xs"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button 
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 p-0.5"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* DUAL VIEWPORT WORKER CARDS: 1 column mobile, 2 columns tablet, 3 columns desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredWorkers.map(worker => {
          const workerDailyWages = dailyWages.filter(w => w.workerId === worker.id && w.date.startsWith(selectedMonth));
          const workerAdvances = advances.filter(a => a.workerId === worker.id && a.date.startsWith(selectedMonth));
          
          const workerGross = workerDailyWages.reduce((acc, curr) => acc + curr.breakdown.total, 0);
          const workerAdvTotal = workerAdvances.reduce((acc, curr) => acc + curr.amount, 0);
          const workerNet = Math.max(0, workerGross - workerAdvTotal);
          const workerHours = workerDailyWages.reduce((acc, curr) => acc + curr.meta.hoursWorked, 0);

          return (
            <div 
              key={worker.id} 
              onClick={() => setSelectedWorkerId(worker.id)}
              className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-blue-300 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group active:scale-[0.99]"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-sm text-slate-700 shrink-0 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      {worker.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                        {worker.name}
                      </h3>
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {worker.designation || 'Factory Staff'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-slate-400 block font-sans">Est. Net</span>
                    <span className="font-mono font-bold text-base text-slate-900 tabular-nums">
                      ₹{workerNet.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums text-slate-600">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-sans">Punches</span>
                    <span className="font-semibold text-slate-800">{workerDailyWages.length} days</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-sans">Hours</span>
                    <span className="font-semibold text-slate-800">{workerHours.toFixed(1)} h</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-sans">Advances</span>
                    <span className={`font-semibold ${workerAdvTotal > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {workerAdvTotal > 0 ? `-₹${workerAdvTotal}` : '₹0'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-blue-600 font-semibold group-hover:text-blue-700">
                <span>View Daily Sheets</span>
                <ChevronRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          );
        })}
      </div>

      {filteredWorkers.length === 0 && (
        <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
          <User size={32} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No matching workers found</p>
          <p className="text-xs text-slate-400 mt-1">Try clearing your search term or adjusting filters.</p>
        </div>
      )}
    </div>
  );
};