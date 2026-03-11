import React, { useState, useEffect } from 'react';
import { Download, MapPinOff, Clock, UserCheck, AlertCircle, Shield, FileText, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dbService } from '../services/db';
import * as XLSX from 'xlsx';

export const ReportsScreen: React.FC = () => {
  const { profile } = useAuth();
  
  // Get the accurate LOCAL month
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
        `\"${r.name}\",\"${r.designation}\",${r.present},${r.absent},${r.late},${r.otHours},${r.geofenceViolations}`
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

  // ========== EPFO ECR GENERATOR - OFFICIAL FORMAT ==========
  // Format: Plain Text (.txt) with #~# delimiter (25 fields)
  // Reference: https://epfindia.gov.in
  const generateECR = async () => {
    if (!profile?.tenantId) {
      alert("⚠️ Tenant ID not found. Please login again.");
      return;
    }
    
    try {
        setLoading(true);
        
        // Fetch organization settings and worker data
        const orgSettings = await dbService.getOrgSettings(profile.tenantId);
        const pfSettings = orgSettings?.compliance || { 
          capPfDeduction: true, 
          dailyWagePfPercentage: 100,
          pfContributionRate: 12,
          epsContributionRate: 8.33,
          epfWageCeiling: 15000
        };
        
        const [workers, allAttendance] = await Promise.all([
            dbService.getWorkers(profile.tenantId),
            dbService.getAttendanceHistory(profile.tenantId)
        ]);
        
        const monthAttendance = allAttendance.filter(r => r.date && r.date.startsWith(reportMonth));
        const [yearStr, monthStr] = reportMonth.split('-');
        const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();

        // Generate ECR lines in official format
        let textLines: string[] = [];
        let processedCount = 0;
        let skippedCount = 0;

        workers.forEach(worker => {
            // Skip if no UAN number
            if (!worker.uan) {
                skippedCount++;
                return;
            }

            const workerRecords = monthAttendance.filter(r => r.workerId === worker.id);
            const presentDays = workerRecords.filter(r => 
                r.status === 'PRESENT' || r.status === 'HALF_DAY'
            ).length; 
            
            // Calculate NCP Days (Non-Contribution Period)
            const workingDays = worker.wageConfig?.workingDaysPerMonth || daysInMonth;
            const ncpDays = Math.max(0, workingDays - presentDays);

            // Calculate Wages
            let grossWage = 0;
            let epfWage = 0;

            if (worker.wageConfig?.type === 'MONTHLY') {
                const fullBasic = worker.wageConfig.monthlyBreakdown?.basic || 0;
                
                // Pro-rata calculation based on attendance
                grossWage = Math.round((worker.wageConfig.amount / workingDays) * presentDays);
                epfWage = Math.round((fullBasic / workingDays) * presentDays);
            } else {
                // Daily Wager
                grossWage = Math.round((worker.wageConfig?.amount || 0) * presentDays);
                epfWage = Math.round(grossWage * (pfSettings.dailyWagePfPercentage / 100));
            }

            // Apply Wage Ceilings
            const wageCeiling = pfSettings.epfWageCeiling || 15000;
            if (pfSettings.capPfDeduction && epfWage > wageCeiling) {
                epfWage = wageCeiling;
            }
            
            const epsWage = epfWage > wageCeiling ? wageCeiling : epfWage;
            const edliWage = epfWage;

            // Calculate Contributions
            const pfRate = (pfSettings.pfContributionRate || 12) / 100;
            const epsRate = (pfSettings.epsContributionRate || 8.33) / 100;
            
            const epfEEDue = Math.round(epfWage * pfRate); // Employee share
            const epfEERemitted = epfEEDue;
            const epsDue = Math.round(epsWage * epsRate); // Employer pension
            const epsRemitted = epsDue;
            const epfERDue = Math.round(epfWage * pfRate) - epsDue; // Diff EPF & EPS
            const epfERRemitted = epfERDue;

            // OFFICIAL ECR FORMAT: 25 fields separated by #~#
            const ecrLine = [
                worker.uan || '',                           // 1. UAN
                worker.name || '',                          // 2. Member Name
                grossWage.toString(),                       // 3. Gross Wages
                epfWage.toString(),                         // 4. EPF Wages
                epsWage.toString(),                         // 5. EPS Wages
                edliWage.toString(),                        // 6. EDLI Wages
                epfEEDue.toString(),                        // 7. EPF Contribution (EE) Due
                epfEERemitted.toString(),                   // 8. EPF Contribution (EE) Remitted
                epsDue.toString(),                          // 9. EPS Contribution Due
                epsRemitted.toString(),                     // 10. EPS Contribution Remitted
                epfERDue.toString(),                        // 11. Diff EPF & EPS (ER) Due
                epfERRemitted.toString(),                   // 12. Diff EPF & EPS (ER) Remitted
                ncpDays.toString(),                         // 13. NCP Days
                '0',                                        // 14. Refund of Advances
                '0',                                        // 15. Arrear EPF Wages
                '0',                                        // 16. Arrear EPF EE Share
                '0',                                        // 17. Arrear EPF ER Share
                '0',                                        // 18. Arrear EPS
                worker.fatherName || worker.name,           // 19. Father/Husband Name
<<<<<<< HEAD
                worker.gender === 'FEMALE' || worker.gender === 'Female' ? 'F' : 'M',    // 20. Relationship (M/F)
                worker.dateOfBirth || '',                   // 21. Date of Birth
                worker.gender === 'FEMALE' || worker.gender === 'Female' ? 'F' : 'M',    // 22. Gender
=======
                worker.gender === 'FEMALE' ? 'F' : 'M',    // 20. Relationship (M/F)
                worker.dateOfBirth || '',                   // 21. Date of Birth
                worker.gender || 'M',                       // 22. Gender
>>>>>>> a342bd5ac7ea77c91cdc1c2760b1d5607acb48b8
                worker.dateOfJoining || '',                 // 23. Date of Joining
                worker.dateOfExit || '',                    // 24. Date of Exit
                ''                                          // 25. Reason for Leaving
            ].join('#~#');

            textLines.push(ecrLine);
            processedCount++;
        });

        if (textLines.length === 0) {
            alert(`❌ No eligible workers found\n\n${skippedCount} workers skipped (missing UAN)\n\nPlease add UAN numbers in Worker Settings.`);
            setLoading(false);
            return;
        }

        // Generate .txt file (NO HEADER - EPFO requirement)
        const textContent = textLines.join('\n');
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `EPFO_ECR_${reportMonth.replace('-', '')}.txt`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        alert(`✅ EPFO ECR Generated Successfully!\n\n📊 Statistics:\n• Processed: ${processedCount} employees\n• Skipped: ${skippedCount} (no UAN)\n• Format: Plain Text (.txt) with #~# delimiter\n• Fields: 25 columns per employee\n\n🌐 Next Steps:\n1. Visit: unifiedportal-mem.epfindia.gov.in\n2. Login with employer credentials\n3. Navigate to ECR section\n4. Upload this .txt file\n5. Review and Submit\n\nDue Date: 15th of following month`);
        
    } catch (err: any) {
        console.error("❌ Error generating ECR:", err);
        alert("❌ Failed to generate EPFO ECR file\n\nError: " + err.message);
    } finally {
        setLoading(false);
    }
  };

  // ========== ESIC RETURN GENERATOR - OFFICIAL FORMAT ==========
  // Format: Excel 97-2003 (.xls) - NOT .xlsx or .csv
  // Reference: https://www.esic.in
  const generateESIC = async () => {
    if (!profile?.tenantId) {
      alert("⚠️ Tenant ID not found. Please login again.");
      return;
    }
    
    try {
        setLoading(true);
        
        const [workers, allAttendance] = await Promise.all([
            dbService.getWorkers(profile.tenantId),
            dbService.getAttendanceHistory(profile.tenantId)
        ]);
        
        const monthAttendance = allAttendance.filter(r => r.date && r.date.startsWith(reportMonth));
        const [yearStr, monthStr] = reportMonth.split('-');
        const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();

        // Official ESIC format: Excel with 6 mandatory columns
        const esicData: any[] = [];
        let processedCount = 0;
        let skippedCount = 0;
        let ineligibleCount = 0;

        workers.forEach(worker => {
            // Skip if no ESIC IP number
            if (!worker.esicIp) {
                skippedCount++;
                return;
            }

            // ESIC Eligibility: Gross Salary ≤ ₹21,000
            const baseGross = worker.wageConfig?.type === 'MONTHLY' 
                 ? worker.wageConfig.amount 
                 : (worker.wageConfig?.amount || 0) * (worker.wageConfig?.workingDaysPerMonth || 26); 
                 
            if (baseGross > 21000) {
                ineligibleCount++;
                return; // Exempt from ESIC
            }

            const workerRecords = monthAttendance.filter(r => r.workerId === worker.id);
            const presentDays = workerRecords.filter(r => 
                r.status === 'PRESENT' || r.status === 'HALF_DAY'
            ).length;
            
            // Calculate Earned Gross Wages
            let earnedGross = 0;
            if (worker.wageConfig?.type === 'MONTHLY') {
                const workingDays = worker.wageConfig.workingDaysPerMonth || daysInMonth;
                earnedGross = Math.round((worker.wageConfig.amount / workingDays) * presentDays);
            } else {
                earnedGross = Math.round((worker.wageConfig?.amount || 0) * presentDays);
            }
            
            // Reason codes as per ESIC guidelines
            let reasonCode = '';
            let lastWorkingDay = '';
            
            if (presentDays === 0) {
                // 0 = Normal working, 1 = Sickness, 2 = Leave/Absent, 3 = Maternity Leave
                reasonCode = '2'; // Leave/Absent
            }
            
            // Check if worker has left employment
            if (worker.status === 'INACTIVE' && worker.dateOfExit) {
                lastWorkingDay = worker.dateOfExit;
            }
            
            // OFFICIAL ESIC COLUMNS (as per portal template)
            esicData.push({
                'IP Number': worker.esicIp,
                'IP Name': worker.name,
                'No of Days for which wages paid/payable during the month': presentDays,
                'Total Monthly Wages': earnedGross,
                'Reason Code for Zero working days': reasonCode,
                'Last Working Day': lastWorkingDay
            });
            
            processedCount++;
        });

        if (esicData.length === 0) {
            alert(`❌ No eligible workers found\n\n📊 Statistics:\n• Missing IP: ${skippedCount}\n• Salary > ₹21k: ${ineligibleCount}\n\nPlease ensure:\n1. Workers have ESIC IP numbers\n2. Gross salary ≤ ₹21,000/month`);
            setLoading(false);
            return;
        }

        // Create Excel workbook in .xls format (Excel 97-2003)
        const worksheet = XLSX.utils.json_to_sheet(esicData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'ESIC Return');
        
        // Set column widths for better readability
        worksheet['!cols'] = [
            { wch: 15 },  // IP Number
            { wch: 25 },  // IP Name
            { wch: 20 },  // Days
            { wch: 20 },  // Wages
            { wch: 25 },  // Reason Code
            { wch: 20 }   // Last Working Day
        ];

        // Generate .xls file (NOT .xlsx)
        XLSX.writeFile(workbook, `ESIC_Return_${reportMonth.replace('-', '')}.xls`, { 
            bookType: 'xls' 
        });
        
        alert(`✅ ESIC Return Generated Successfully!\n\n📊 Statistics:\n• Processed: ${processedCount} employees\n• Skipped (no IP): ${skippedCount}\n• Ineligible (>₹21k): ${ineligibleCount}\n• Format: Excel 97-2003 (.xls)\n\n🌐 Next Steps:\n1. Visit: www.esic.in\n2. Login to Employer Portal\n3. Go to: File Monthly Contribution\n4. Upload this Excel file\n5. Verify and Submit\n\nDue Date: 15th of following month\n\nContribution Rates:\n• Employee: 0.75%\n• Employer: 3.25%`);
        
    } catch (err: any) {
        console.error("❌ Error generating ESIC:", err);
        alert("❌ Failed to generate ESIC file\n\nError: " + err.message);
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
<<<<<<< HEAD
      <div className="bg-linear-to-br from-indigo-50 via-purple-50 to-pink-50 p-6 rounded-xl shadow-lg border border-indigo-200 mb-6">
=======
      <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-6 rounded-xl shadow-lg border border-indigo-200 mb-6">
>>>>>>> a342bd5ac7ea77c91cdc1c2760b1d5607acb48b8
          <div className="flex items-start gap-3 mb-4">
              <div className="bg-indigo-600 p-2 rounded-lg">
                  <Shield size={24} className="text-white"/>
              </div>
              <div className="flex-1">
                  <h3 className="font-bold text-gray-800 text-lg mb-1">
                      Government Statutory Returns
                  </h3>
                  <p className="text-sm text-gray-600">
                      Official compliance formats accepted by EPFO & ESIC portals
                  </p>
              </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {/* EPFO Card */}
              <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                      <FileText size={20} className="text-indigo-600"/>
                      <h4 className="font-bold text-gray-800">EPFO (ECR)</h4>
                  </div>
                  <ul className="text-xs text-gray-600 space-y-1.5 mb-4">
                      <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>Plain Text (.txt) format</span>
                      </li>
                      <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>25 fields with #~# delimiter</span>
                      </li>
                      <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>Auto-calculated contributions</span>
                      </li>
                      <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>UAN-based filing</span>
                      </li>
                  </ul>
                  <button 
                      onClick={generateECR}
                      disabled={loading}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      <Download size={16} className="mr-2"/> 
                      Generate EPFO ECR
                  </button>
              </div>
              
              {/* ESIC Card */}
              <div className="bg-white p-4 rounded-lg border border-teal-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                      <FileSpreadsheet size={20} className="text-teal-600"/>
                      <h4 className="font-bold text-gray-800">ESIC Return</h4>
                  </div>
                  <ul className="text-xs text-gray-600 space-y-1.5 mb-4">
                      <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>Excel 97-2003 (.xls) format</span>
                      </li>
                      <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>Portal-compatible template</span>
                      </li>
                      <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>Salary ≤ ₹21,000 eligibility</span>
                      </li>
                      <li className="flex items-start">
                          <span className="text-green-500 mr-2">✓</span>
                          <span>IP Number validation</span>
                      </li>
                  </ul>
                  <button 
                      onClick={generateESIC}
                      disabled={loading}
                      className="w-full bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      <Download size={16} className="mr-2"/> 
                      Generate ESIC Return
                  </button>
              </div>
          </div>
          
          {/* Quick Info */}
          <div className="bg-white/70 backdrop-blur-sm p-3 rounded-lg border border-indigo-100">
              <p className="text-xs text-gray-600 font-medium">
                  <span className="font-bold text-indigo-600">📅 Due Date:</span> 15th of following month | 
                  <span className="font-bold text-teal-600 ml-2">📋 Requirements:</span> Workers must have UAN (EPFO) & IP Number (ESIC)
              </p>
          </div>
      </div>

      {/* Help Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <h4 className="font-bold text-blue-800 mb-3 flex items-center">
              <AlertCircle size={18} className="mr-2"/> Important Information
          </h4>
          <div className="space-y-3">
              <div className="bg-white p-3 rounded-lg">
                  <p className="font-bold text-indigo-700 text-sm mb-1">🔹 EPFO (ECR) - Employee Provident Fund</p>
                  <ul className="text-xs text-gray-700 space-y-1 ml-4">
                      <li>• Format: Plain Text (.txt) with #~# (hash-tilda-hash) delimiter</li>
                      <li>• Fields: 25 mandatory columns per employee</li>
                      <li>• Requirement: All workers must have UAN numbers</li>
                      <li>• Upload: unifiedportal-mem.epfindia.gov.in</li>
                      <li>• Contribution: EE 12% + ER 12% (split: 8.33% EPS + 3.67% EPF)</li>
                  </ul>
              </div>
              
              <div className="bg-white p-3 rounded-lg">
                  <p className="font-bold text-teal-700 text-sm mb-1">🔹 ESIC - Employee State Insurance Corporation</p>
                  <ul className="text-xs text-gray-700 space-y-1 ml-4">
                      <li>• Format: Excel 97-2003 (.xls) - NOT .xlsx or .csv</li>
                      <li>• Eligibility: Gross salary ≤ ₹21,000 per month</li>
                      <li>• Requirement: All eligible workers must have IP numbers</li>
                      <li>• Upload: www.esic.in (File Monthly Contribution section)</li>
                      <li>• Contribution: EE 0.75% + ER 3.25% = 4% of gross wages</li>
                  </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <p className="font-bold text-amber-800 text-sm mb-1">⚠️ Before Generating Reports</p>
                  <ul className="text-xs text-gray-700 space-y-1 ml-4">
                      <li>• Ensure all workers have UAN & ESIC IP numbers in Settings</li>
                      <li>• Verify attendance data is complete for the month</li>
                      <li>• Check wage configurations (Monthly/Daily) are correct</li>
                      <li>• Monthly & Daily wages are automatically pro-rated based on attendance</li>
                  </ul>
              </div>
          </div>
      </div>

      {/* Muster Roll Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
         <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-sm text-gray-800 flex items-center">
                <UserCheck size={16} className="mr-2 text-blue-600"/> Monthly Muster Roll
            </h3>
            <button 
                onClick={exportCSV} 
                disabled={loading || reportData.length === 0}
                className="text-blue-600 bg-blue-50 p-2 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Download CSV"
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
                                 Processing report...
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
                                 <span className="bg-green-50 text-green-700 px-2 py-1 rounded font-bold text-xs">
                                     {row.present}
                                 </span>
                             </td>
                             <td className="p-3 text-center">
                                 <span className="bg-red-50 text-red-700 px-2 py-1 rounded font-bold text-xs">
                                     {row.absent}
                                 </span>
                             </td>
                             <td className="p-3 text-center">
                                 <span className="text-orange-600 font-bold">{row.late}</span>
                             </td>
                             <td className="p-3 text-center font-mono text-gray-600">
                                 {row.otHours}
                             </td>
                             <td className="p-3 pr-4 text-center">
                                {row.geofenceViolations > 0 ? (
                                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded font-bold text-xs inline-flex items-center">
                                        <AlertCircle size={12} className="mr-1"/> {row.geofenceViolations}
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
