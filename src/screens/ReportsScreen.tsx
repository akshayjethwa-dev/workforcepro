import React, { useState, useEffect } from 'react';
import { Download, MapPinOff, Clock, UserCheck, AlertCircle, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';

export const ReportsScreen: React.FC = () => {
  const { profile } = useAuth();
  
  // 1. FIXED: Get the accurate LOCAL month, not UTC (Solves timezone mismatch)
  const getLocalMonth = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const [reportMonth, setReportMonth] = useState(getLocalMonth());
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReportData = async () => {
      if (!profile?.tenantId) return;
      setLoading(true);
      setError(null);
      
      try {
          const [workers, allAttendance] = await Promise.all([
             dbService.getWorkers(profile.tenantId),
             dbService.getAttendanceHistory(profile.tenantId)
          ]);
          
          const monthAttendance = allAttendance.filter(r => r.date && r.date.startsWith(reportMonth));

          // Aggregate data per worker
          const aggregated = workers.map(worker => {
            const workerRecords = monthAttendance.filter(r => r.workerId === worker.id);
            let present = 0, absent = 0, late = 0, ot = 0, geofenceViolations = 0;

            workerRecords.forEach(r => {
                if (r.status === 'PRESENT' || r.status === 'HALF_DAY') present++;
                if (r.status === 'ABSENT') absent++;
                if (r.lateStatus?.isLate) late++;
                ot += r.hours?.overtime || 0;
                
                // 2. FIXED: Safely count out-of-bounds punches to prevent crashes on old records
                if (r.timeline && Array.isArray(r.timeline)) {
                    r.timeline.forEach(punch => {
                        if (punch.isOutOfGeofence) geofenceViolations++;
                    });
                }
            });

            return {
                name: worker.name,
                designation: worker.designation || 'Worker',
                present,
                absent,
                late,
                otHours: ot.toFixed(1),
                geofenceViolations
            };
          });

          setReportData(aggregated);
      } catch (err: any) {
          console.error("Error generating report:", err);
          setError("Failed to load report data.");
      } finally {
          setLoading(false);
      }
    };
    
    fetchReportData();
  }, [profile, reportMonth]);

  const exportCSV = () => {
    if (reportData.length === 0) return alert("No data to export for this month.");

    const headers = "Worker Name,Designation,Present Days,Absent Days,Late Arrivals,OT Hours,Geofence Violations\n";
    const rows = reportData.map(r => 
        `"${r.name}","${r.designation}",${r.present},${r.absent},${r.late},${r.otHours},${r.geofenceViolations}`
    ).join("\n");
    
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `Workforce_Report_${reportMonth}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // --- COMPLIANCE EXPORT ENGINE: EPFO (ECR) ---
  const generateECR = async () => {
    if (!profile?.tenantId) return;
    
    try {
        // 1. Fetch data
        const orgSettings = await dbService.getOrgSettings(profile.tenantId);
        const pfSettings = orgSettings?.compliance || { capPfDeduction: true, dailyWagePfPercentage: 100 };
        
        const [workers, allAttendance] = await Promise.all([
            dbService.getWorkers(profile.tenantId),
            dbService.getAttendanceHistory(profile.tenantId)
        ]);
        
        const monthAttendance = allAttendance.filter(r => r.date && r.date.startsWith(reportMonth));
        const [yearStr, monthStr] = reportMonth.split('-');
        const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();

        let csvContent = "UAN,Member Name,Gross Wages,EPF Wages,EPS Wages,EDLI Wages,EPF Contribution,EPS Contribution,NCP Days\n";

        // 2. Filter & Normalize
        workers.forEach(worker => {
            if (!worker.uan) return; // Skip if no UAN

            const workerRecords = monthAttendance.filter(r => r.workerId === worker.id);
            const presentDays = workerRecords.filter(r => r.status === 'PRESENT' || r.status === 'HALF_DAY').length; 
            
            // Count Days Absent (NCP Days)
            const workingDays = worker.wageConfig.workingDaysPerMonth || daysInMonth;
            const ncpDays = Math.max(0, workingDays - presentDays);

            let grossWage = 0;
            let epfWage = 0;

            // THE NORMALIZATION ENGINE
            if (worker.wageConfig.type === 'MONTHLY') {
                const fullBasic = worker.wageConfig.monthlyBreakdown?.basic || 0; // Uses explicitly defined Basic
                
                // Earned wages based on attendance
                grossWage = Math.round((worker.wageConfig.amount / workingDays) * presentDays);
                epfWage = Math.round((fullBasic / workingDays) * presentDays);
            } else {
                // Daily Wager
                grossWage = Math.round(worker.wageConfig.amount * presentDays);
                epfWage = Math.round(grossWage * (pfSettings.dailyWagePfPercentage / 100));
            }

            // Apply Wage Ceilings
            if (pfSettings.capPfDeduction && epfWage > 15000) {
                epfWage = 15000;
            }
            let epsWage = epfWage > 15000 ? 15000 : epfWage;

            // The Math
            const epfContribution = Math.round(epfWage * 0.12); // Employee 12%
            const epsContribution = Math.round(epsWage * 0.0833); // Employer 8.33% to Pension

            csvContent += `"${worker.uan}","${worker.name}",${grossWage},${epfWage},${epsWage},${epfWage},${epfContribution},${epsContribution},${ncpDays}\n`;
        });

        if (csvContent.trim().split('\n').length <= 1) {
            alert("No workers found with UAN numbers for this month.");
            return;
        }

        // Generate Download
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `EPFO_ECR_${reportMonth}.csv`;
        a.click();
    } catch (err: any) {
        console.error("Error generating ECR file:", err);
        alert("Failed to generate Compliance Export. Please try again.");
    }
  };

  // --- COMPLIANCE EXPORT ENGINE: ESIC ---
  const generateESIC = async () => {
    if (!profile?.tenantId) return;
    
    try {
        const [workers, allAttendance] = await Promise.all([
            dbService.getWorkers(profile.tenantId),
            dbService.getAttendanceHistory(profile.tenantId)
        ]);
        
        const monthAttendance = allAttendance.filter(r => r.date && r.date.startsWith(reportMonth));
        const [yearStr, monthStr] = reportMonth.split('-');
        const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();

        // Standard ESIC Portal Columns
        let csvContent = "IP Number,IP Name,No of Days Worked,Total Monthly Wages,Reason Code for Zero working days,Last Working Day\n";

        workers.forEach(worker => {
            if (!worker.esicIp) return; // Skip if no ESIC IP

            // ESIC Eligibility Check: Is standard Gross Salary <= ₹21,000?
            const baseGross = worker.wageConfig.type === 'MONTHLY' 
                 ? worker.wageConfig.amount 
                 : worker.wageConfig.amount * (worker.wageConfig.workingDaysPerMonth || 26); 
                 
            if (baseGross > 21000) return; // Exempt from ESIC

            const workerRecords = monthAttendance.filter(r => r.workerId === worker.id);
            const presentDays = workerRecords.filter(r => r.status === 'PRESENT' || r.status === 'HALF_DAY').length;
            
            let earnedGross = 0;
            if (worker.wageConfig.type === 'MONTHLY') {
                const workingDays = worker.wageConfig.workingDaysPerMonth || daysInMonth;
                earnedGross = Math.round((worker.wageConfig.amount / workingDays) * presentDays);
            } else {
                earnedGross = Math.round(worker.wageConfig.amount * presentDays);
            }
            
            const reasonCode = presentDays === 0 ? "2" : ""; // Code 2 usually signifies Leave/Absent
            
            csvContent += `"${worker.esicIp}","${worker.name}",${presentDays},${earnedGross},${reasonCode},\n`;
        });

        if (csvContent.trim().split('\n').length <= 1) {
            alert("No eligible workers found with ESIC IP numbers (or all exceed ₹21k limit).");
            return;
        }

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ESIC_Return_${reportMonth}.csv`;
        a.click();
    } catch (err: any) {
        console.error("Error generating ESIC file:", err);
        alert("Failed to generate ESIC Export.");
    }
  };

  return (
    <div className="p-4 bg-gray-50 min-h-screen pb-24">
      <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-bold text-gray-800">Factory Reports</h1>
          <input 
              type="month" 
              className="p-2 border border-gray-200 rounded-lg text-sm bg-white shadow-sm font-bold text-blue-600 outline-none focus:ring-2 focus:ring-blue-500"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
          />
      </div>

      {error && (
         <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 flex items-center text-sm">
             <AlertCircle size={18} className="mr-2" />
             {error}
         </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
             <div className="flex items-center text-red-500 mb-2">
                 <MapPinOff size={18} className="mr-2"/> 
                 <span className="font-bold text-xs uppercase">Location Alerts</span>
             </div>
             <p className="text-2xl font-bold text-gray-800">
                 {loading ? '-' : reportData.reduce((sum, r) => sum + r.geofenceViolations, 0)}
             </p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
             <div className="flex items-center text-orange-500 mb-2">
                 <Clock size={18} className="mr-2"/> 
                 <span className="font-bold text-xs uppercase">Total OT Hrs</span>
             </div>
             <p className="text-2xl font-bold text-gray-800">
                 {loading ? '-' : reportData.reduce((sum, r) => sum + parseFloat(r.otHours), 0).toFixed(1)}h
             </p>
          </div>
      </div>

      {/* --- NEW: Statutory Export Hub --- */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
              <h3 className="font-bold text-gray-800 flex items-center">
                  <Shield size={18} className="mr-2 text-indigo-600"/> Generate Statutory Returns
              </h3>
              <p className="text-xs text-gray-500 mt-1">One-click compliance export normalized for Daily & Monthly wages.</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
              <button 
                  onClick={generateECR}
                  className="flex-1 sm:flex-none bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-colors"
              >
                  <Download size={16} className="mr-2"/> EPFO (ECR)
              </button>
              <button 
                  onClick={generateESIC}
                  className="flex-1 sm:flex-none bg-teal-50 text-teal-700 hover:bg-teal-100 px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-colors"
              >
                  <Download size={16} className="mr-2"/> ESIC
              </button>
          </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
         <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-bold text-sm text-gray-800 flex items-center">
                <UserCheck size={16} className="mr-2 text-blue-600"/> Monthly Muster Roll
            </h3>
            <button 
                onClick={exportCSV} 
                disabled={loading || reportData.length === 0}
                className="text-blue-600 bg-blue-50 p-2 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
                <Download size={18}/>
            </button>
         </div>
         <div className="overflow-x-auto">
             <table className="w-full text-left text-sm whitespace-nowrap">
                 <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase font-bold tracking-wider">
                     <tr>
                         <th className="p-3 pl-4">Worker</th>
                         <th className="p-3 text-center">Present</th>
                         <th className="p-3 text-center">Late</th>
                         <th className="p-3 text-center">OT (h)</th>
                         <th className="p-3 pr-4 text-center">Violations</th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                     {loading ? (
                         <tr><td colSpan={5} className="p-12 text-center text-gray-400">Processing report...</td></tr>
                     ) : reportData.length === 0 ? (
                         <tr><td colSpan={5} className="p-12 text-center text-gray-400">No workers found for this month.</td></tr>
                     ) : reportData.map((row, i) => (
                         <tr key={i} className="hover:bg-gray-50 transition-colors">
                             <td className="p-3 pl-4">
                                 <p className="font-bold text-gray-800">{row.name}</p>
                                 <p className="text-[10px] text-gray-500">{row.designation}</p>
                             </td>
                             <td className="p-3 text-center text-green-600 font-bold bg-green-50/30">{row.present}</td>
                             <td className="p-3 text-center text-orange-500 font-bold">{row.late}</td>
                             <td className="p-3 text-center font-mono text-gray-600">{row.otHours}</td>
                             <td className="p-3 pr-4 text-center">
                                {row.geofenceViolations > 0 ? (
                                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded font-bold text-[10px] inline-flex items-center">
                                        <AlertCircle size={10} className="mr-1"/> {row.geofenceViolations}
                                    </span>
                                ) : (
                                    <span className="text-gray-300">-</span>
                                )}
                             </td>
                         </tr>
                     ))}
                 </tbody>
             </table>
         </div>
      </div>
    </div>
  );
};