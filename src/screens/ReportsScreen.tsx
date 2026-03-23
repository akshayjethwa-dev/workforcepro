import React, { useState, useEffect, useRef } from 'react';
import { Download, MapPinOff, Clock, UserCheck, AlertCircle, Shield, FileText, FileSpreadsheet, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import * as XLSX from 'xlsx';

// --- NEW CAPACITOR IMPORTS ---
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

// Import the Web Worker using Vite's worker suffix
import ReportWorker from '../workers/reportWorker?worker';

export const ReportsScreen: React.FC = () => {
  const { profile, limits, tenantPlan } = useAuth();
  const workerRef = useRef<Worker | null>(null);
  
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

  // Initialize the Web Worker on mount
  useEffect(() => {
    workerRef.current = new ReportWorker();
    return () => {
      workerRef.current?.terminate(); // Cleanup worker on unmount
    };
  }, []);

  // Promise wrapper for the Web Worker
  const runWorkerTask = (action: string, payload: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) return reject(new Error("Worker not initialized"));

      const id = Math.random().toString(36).substring(7);

      const handleMessage = (e: MessageEvent) => {
        if (e.data.id === id) {
          workerRef.current?.removeEventListener('message', handleMessage);
          if (e.data.success) {
            resolve(e.data.result);
          } else {
            reject(new Error(e.data.error));
          }
        }
      };

      workerRef.current.addEventListener('message', handleMessage);
      workerRef.current.postMessage({ action, payload, id });
    });
  };

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

          // Send data to Web Worker to process off the main thread
          const aggregated = await runWorkerTask('AGGREGATE_REPORT', { workers, monthAttendance });
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

  // ==========================================
  // 1. CSV EXPORT WITH NATIVE SUPPORT
  // ==========================================
  const exportCSV = async () => {
    if (reportData.length === 0) return alert("No data to export for this month.");
    
    try {
        setLoading(true);
        const csvContent = await runWorkerTask('GENERATE_CSV', { reportData });
        const fileName = `Workforce_Report_${reportMonth}.csv`;

        if (Capacitor.isNativePlatform()) {
            // NATIVE: Save to Device Documents Folder
            const result = await Filesystem.writeFile({
                path: fileName,
                data: csvContent,
                directory: Directory.Documents,
                encoding: Encoding.UTF8
            });
            alert(`✅ Saved successfully to Documents: \n${result.uri}`);
        } else {
            // WEB: Standard browser download
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('hidden', '');
            a.setAttribute('href', url);
            a.setAttribute('download', fileName);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }
    } catch(err) {
        alert("Failed to export CSV");
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  // ==========================================
  // 2. EPFO (ECR) TEXT EXPORT WITH NATIVE SUPPORT
  // ==========================================
  const generateECR = async () => {
    if (!profile?.tenantId) return alert("⚠️ Tenant ID not found.");
    
    try {
        setLoading(true);
        const orgSettings = await dbService.getOrgSettings(profile.tenantId);
        const pfSettings = orgSettings?.compliance || { 
          capPfDeduction: true, dailyWagePfPercentage: 100, pfContributionRate: 12, epsContributionRate: 8.33, epfWageCeiling: 15000
        };
        
        const [workers, allAttendance] = await Promise.all([
            dbService.getWorkers(profile.tenantId),
            dbService.getAttendanceHistory(profile.tenantId)
        ]);
        
        const monthAttendance = allAttendance.filter(r => r.date && r.date.startsWith(reportMonth));
        const [yearStr, monthStr] = reportMonth.split('-');
        const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();

        const { textContent, processedCount, skippedCount } = await runWorkerTask('GENERATE_ECR', {
            workers, monthAttendance, pfSettings, daysInMonth
        });

        if (processedCount === 0) {
            alert(`❌ No eligible workers found\n\n${skippedCount} workers skipped (missing UAN)`);
            setLoading(false);
            return;
        }

        const fileName = `EPFO_ECR_${reportMonth.replace('-', '')}.txt`;

        if (Capacitor.isNativePlatform()) {
            // NATIVE: Save to Device Documents Folder
            const result = await Filesystem.writeFile({
                path: fileName,
                data: textContent,
                directory: Directory.Documents,
                encoding: Encoding.UTF8
            });
            alert(`✅ EPFO ECR Saved to Documents!\nFile: ${fileName}\nProcessed: ${processedCount} | Skipped: ${skippedCount}`);
        } else {
            // WEB: Standard browser download
            const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            window.URL.revokeObjectURL(url);
            alert(`✅ EPFO ECR Generated Successfully!\n• Processed: ${processedCount}\n• Skipped: ${skippedCount} (no UAN)`);
        }
        
    } catch (err: any) {
        alert("❌ Failed to generate EPFO ECR file\nError: " + err.message);
    } finally {
        setLoading(false);
    }
  };

  // ==========================================
  // 3. ESIC EXCEL EXPORT WITH NATIVE SUPPORT
  // ==========================================
  const generateESIC = async () => {
    if (!profile?.tenantId) return alert("⚠️ Tenant ID not found.");
    
    try {
        setLoading(true);
        const [workers, allAttendance] = await Promise.all([
            dbService.getWorkers(profile.tenantId),
            dbService.getAttendanceHistory(profile.tenantId)
        ]);
        
        const monthAttendance = allAttendance.filter(r => r.date && r.date.startsWith(reportMonth));
        const [yearStr, monthStr] = reportMonth.split('-');
        const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();

        const { esicData, processedCount, skippedCount, ineligibleCount } = await runWorkerTask('GENERATE_ESIC', {
            workers, monthAttendance, daysInMonth
        });

        if (esicData.length === 0) {
            alert(`❌ No eligible workers found\n• Missing IP: ${skippedCount}\n• Salary > ₹21k: ${ineligibleCount}`);
            setLoading(false);
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(esicData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'ESIC Return');
        worksheet['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 20 }];

        const fileName = `ESIC_Return_${reportMonth.replace('-', '')}.xls`;

        if (Capacitor.isNativePlatform()) {
            // NATIVE: Convert Excel to base64 string for Capacitor Filesystem
            const base64Excel = XLSX.write(workbook, { bookType: 'xls', type: 'base64' });
            
            await Filesystem.writeFile({
                path: fileName,
                data: base64Excel,
                directory: Directory.Documents
            });
            alert(`✅ ESIC Return Saved to Documents!\nFile: ${fileName}\nProcessed: ${processedCount} | Skipped: ${skippedCount}`);
        } else {
            // WEB: Let XLSX handle standard browser download
            XLSX.writeFile(workbook, fileName, { bookType: 'xls' });
            alert(`✅ ESIC Return Generated Successfully!\n• Processed: ${processedCount}\n• Skipped (no IP): ${skippedCount}\n• Ineligible (>₹21k): ${ineligibleCount}`);
        }
        
    } catch (err: any) {
        alert("❌ Failed to generate ESIC file\nError: " + err.message);
        console.error(err);
    } finally {
        setLoading(false);
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

      {/* STATUTORY COMPLIANCE SECTION */}
      {limits?.statutoryComplianceEnabled ? (
          <>
            <div className="bg-linear-to-br from-indigo-50 via-purple-50 to-pink-50 p-6 rounded-xl shadow-lg border border-indigo-200 mb-6">
                <div className="flex items-start gap-3 mb-4">
                    <div className="bg-indigo-600 p-2 rounded-lg">
                        <Shield size={24} className="text-white"/>
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-gray-800 text-lg mb-1">Government Statutory Returns</h3>
                        <p className="text-sm text-gray-600">Official compliance formats accepted by EPFO & ESIC portals</p>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <FileText size={20} className="text-indigo-600"/>
                            <h4 className="font-bold text-gray-800">EPFO (ECR)</h4>
                        </div>
                        <button 
                            onClick={generateECR}
                            disabled={loading}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download size={16} className="mr-2"/> {loading ? 'Processing...' : 'Generate EPFO ECR'}
                        </button>
                    </div>
                    
                    <div className="bg-white p-4 rounded-lg border border-teal-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <FileSpreadsheet size={20} className="text-teal-600"/>
                            <h4 className="font-bold text-gray-800">ESIC Return</h4>
                        </div>
                        <button 
                            onClick={generateESIC}
                            disabled={loading}
                            className="w-full bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download size={16} className="mr-2"/> {loading ? 'Processing...' : 'Generate ESIC Return'}
                        </button>
                    </div>
                </div>
            </div>
          </>
      ) : (
          <div className="bg-gray-100 rounded-3xl shadow-inner border border-gray-200 p-6 mb-6 opacity-70">
              <div className="flex items-center mb-2">
                  <Lock className="text-gray-500 mr-2" size={24} />
                  <h3 className="font-bold text-gray-800 text-lg">Government Statutory Returns Locked</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                  Available exclusively on the Enterprise Plan.
              </p>
          </div>
      )}

      {/* Muster Roll Table */}
      {tenantPlan !== 'FREE' ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
             <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-sm text-gray-800 flex items-center">
                    <UserCheck size={16} className="mr-2 text-blue-600"/> Monthly Muster Roll
                </h3>
                <button 
                    onClick={exportCSV} 
                    disabled={loading || reportData.length === 0}
                    className="text-blue-600 bg-blue-50 p-2 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Download size={18}/>
                </button>
             </div>
             <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm">
                     <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold">
                         <tr>
                             <th className="p-3 pl-4">Worker</th>
                             <th className="p-3 text-center">Present</th>
                             <th className="p-3 text-center">Absent</th>
                             <th className="p-3 text-center">Late</th>
                             <th className="p-3 text-center">OT (h)</th>
                             <th className="p-3 pr-4 text-center">Violations</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                         {loading ? (
                             <tr>
                                 <td colSpan={6} className="p-12 text-center text-gray-400">
                                     Processing report data in background...
                                 </td>
                             </tr>
                         ) : reportData.length === 0 ? (
                             <tr>
                                 <td colSpan={6} className="p-12 text-center text-gray-400">
                                     No workers found for this month.
                                 </td>
                             </tr>
                         ) : reportData.map((row, i) => (
                             <tr key={i} className="hover:bg-gray-50 transition-colors">
                                 <td className="p-3 pl-4">
                                     <p className="font-bold text-gray-800">{row.name}</p>
                                     <p className="text-xs text-gray-500">{row.designation}</p>
                                 </td>
                                 <td className="p-3 text-center">
                                     <span className="bg-green-50 text-green-700 px-2 py-1 rounded font-bold text-xs">{row.present}</span>
                                 </td>
                                 <td className="p-3 text-center">
                                     <span className="bg-red-50 text-red-700 px-2 py-1 rounded font-bold text-xs">{row.absent}</span>
                                 </td>
                                 <td className="p-3 text-center text-orange-600 font-bold">{row.late}</td>
                                 <td className="p-3 text-center font-mono text-gray-600">{row.otHours}</td>
                                 <td className="p-3 pr-4 text-center">
                                    {row.geofenceViolations > 0 ? (
                                        <span className="bg-red-100 text-red-700 px-2 py-1 rounded font-bold text-xs inline-flex items-center">
                                            <AlertCircle size={12} className="mr-1"/> {row.geofenceViolations}
                                        </span>
                                    ) : <span className="text-gray-300">-</span>}
                                 </td>
                             </tr>
                         ))}
                     </tbody>
                 </table>
             </div>
          </div>
      ) : (
          <div className="bg-gray-100 rounded-3xl shadow-inner border border-gray-200 p-6 opacity-70">
              <div className="flex items-center mb-2">
                  <Lock className="text-gray-500 mr-2" size={24} />
                  <h3 className="font-bold text-gray-800 text-lg">Monthly Muster Roll Locked</h3>
              </div>
          </div>
      )}
    </div>
  );
};